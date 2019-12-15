const assert = require('assert');
const fs = require('fs');
const input = fs.readFileSync('15.txt', 'utf-8').trim();
const tests = [];

function createPipe() {
	const buf = [];
	let onWrite = null;

	return {
		write: async function write(value) {
			buf.push(value);
			if (onWrite) {
				onWrite();
			}
		},
		read: async function read() {
			if (buf.length) {
				return buf.shift();
			} else {
				return new Promise(resolve => {
					onWrite = resolve;
				}).then(() => {
					onWrite = null;
					return read();
				});
			}
		}
	}
}

const NORTH = 1;
const SOUTH = 2;
const WEST = 3;
const EAST = 4;

async function run(input) {
	const mem = input.split(',').map(x => parseInt(x, 10));
	const debug = false;
	
	const grid = new Map();
	const paths = [[]];
	let center;

	while (paths.length) {
		const path = paths.shift();
		for (let nextPath of extendPath(path)) {
			const statuses = await runPath(mem, nextPath);
			if (statuses[statuses.length - 1] === 2) {
				center = coordsOfPath(nextPath);
			}

			if (statuses[statuses.length - 1] !== 0) {
				const [x, y] = coordsOfPath(nextPath);
				if (!grid.has(`${x},${y}`)) {
					paths.push(nextPath);
					grid.set(`${x},${y}`, statuses[statuses.length - 1]);
				}
			}
		}
	}

	for (let y = -30; y < 30; ++y) {
		for (let x = -30; x < 30; ++x) {
			process.stdout.write(
				x === center[0] && y === center[1] ? '@' :
				grid.has(`${x},${y}`) ? '.' : '#');
		}
		process.stdout.write('\n');
	}

	let openSet = [center];
	grid.delete(center.join(','));
	let n = 0;
	while (openSet.length) {
		const nextSet = [];
		for (let coords of openSet) {
			for (let neighbor of neighbors(coords)) {
				if (grid.has(neighbor.join(','))) {
					grid.delete(neighbor.join(','));
					nextSet.push(neighbor);
				}
			}
		}
		openSet = nextSet;
		++n;
	}

	return n - 1;
}

function neighbors([x, y]) {
	return [
		[x-1, y],
		[x+1, y],
		[x, y-1],
		[x, y+1]
	];
}

function coordsOfPath(path) {
	return path.reduce(([x, y], m) => {
		switch (m) {
			case WEST:
				return [x - 1, y];
			case EAST:
				return [x + 1, y];
			case NORTH:
				return [x, y - 1];
			case SOUTH:
				return [x, y + 1];
		}
	}, [0, 0]);
}

function extendPath(path) {
	const lastMove = path[path.length - 1];
	const oppositeMove = { [NORTH]: SOUTH, [SOUTH]: NORTH, [EAST]: WEST, [WEST]: EAST }[lastMove];
	const nextMoves = [NORTH, SOUTH, EAST, WEST].filter(m => m !== oppositeMove);
	return nextMoves.map(m => [...path, m]);
}

async function runPath(mem, path) {
	const inPipe = createPipe();
	const outPipe = createPipe();
	const machine = constructMachine(
		'Breakout',
		mem.slice(),
		inPipe.read,
		outPipe.write);
	runMachine(machine, false);
	const statuses = [];
	for (let move of path) {
		inPipe.write(move);
		statuses.push(await outPipe.read());
	}
	return statuses;
}

function constructMachine(id, mem, getInput, sendOutput) {
	return {
		id,
		mem: mem.slice(),
		getInput,
		sendOutput,
		pc: 0,
		relativeBase: 0
	};
}

async function runMachine(machine, debug) {
	while (await stepMachine(machine, debug)) {}
}

async function stepMachine(machine, debug) {
	if (machine.pc == null) {
		return false;
	} else {
		machine.pc = await runInstruction(machine, debug);
		return true;
	}
}

async function runInstruction(machine, debug) {
	const { id, mem, pc, getInput, sendOutput } = machine;
	const [z, a, b, c] = mem.slice(pc);
	const opcode = z % 100;
	const aMode = (z / 100 | 0) % 10;
	const bMode = (z / 1000 | 0) % 10;
	const cMode = (z / 10000 | 0) % 10;

	switch (opcode) {
		case 1: // c := a + b
			if (debug) {
				console.log(`[${id}] ${String(pc).padStart(4)}:  ${z},${a},${b},${c}`);
				console.log(`[${id}]        ${showAssign(c, cMode)} = ${showArg(a, aMode)} + ${showArg(b, bMode)}`);
			}
			assign(c, cMode, value(a, aMode) + value(b, bMode));
			return pc + 4;

		case 2: // c := a * b
			if (debug) {
				console.log(`[${id}] ${String(pc).padStart(4)}:  ${z},${a},${b},${c}`);
				console.log(`[${id}]        ${showAssign(c, cMode)} = ${showArg(a, aMode)} * ${showArg(b, bMode)}`);
			}
			assign(c, cMode, value(a, aMode) * value(b, bMode));
			return pc + 4;

		case 3: // a := input
			if (debug) {
				console.log(`[${id}] ${String(pc).padStart(4)}:  ${z},${a}`);
				console.log(`[${id}]        awaiting input...`);
			}
			const input = await getInput();
			if (debug) {
				console.log(`[${id}] ${String(pc).padStart(4)}:  ${z},${a}`);
				console.log(`[${id}]        ${showAssign(a, aMode)} = input <${input}>`);
			}
			assign(a, aMode, input);
			return pc + 2;

		case 4: // output a
			if (debug) {
				console.log(`[${id}] ${String(pc).padStart(4)}:  ${z},${a}`);
				console.log(`[${id}]        output ${showArg(a, aMode)}`);
			}
			await sendOutput(value(a, aMode));
			return pc + 2;

		case 5: // jnz a => b
			if (debug) {
				console.log(`[${id}] ${String(pc).padStart(4)}:  ${z},${a},${b}`);
				console.log(`[${id}]        jnz ${showArg(a, aMode)} => ${showArg(b, bMode)}`);
			}
			if (value(a, aMode) !== 0) {
				return value(b, bMode);
			} else {
				return pc + 3;
			}

		case 6: // jez a => b
			if (debug) {
				console.log(`[${id}] ${String(pc).padStart(4)}:  ${z},${a},${b}`);
				console.log(`[${id}]        jez ${showArg(a, aMode)} => ${showArg(b, bMode)}`);
			}
			if (value(a, aMode) === 0) {
				return value(b, bMode);
			} else {
				return pc + 3;
			}

		case 7: // c := a < b
			if (debug) {
				console.log(`[${id}] ${String(pc).padStart(4)}:  ${z},${a},${b},${c}`);
				console.log(`[${id}]        ${showAssign(c, cMode)} = ${showArg(a, aMode)} < ${showArg(b, bMode)}`);
			}
			assign(c, cMode, value(a, aMode) < value(b, bMode) ? 1 : 0);
			return pc + 4;

		case 8: // c := a == b
			if (debug) {
				console.log(`[${id}] ${String(pc).padStart(4)}:  ${z},${a},${b},${c}`);
				console.log(`[${id}]        ${showAssign(c, cMode)} = ${showArg(a, aMode)} == ${showArg(b, bMode)}`);
			}
			assign(c, cMode, value(a, aMode) === value(b, bMode) ? 1 : 0);
			return pc + 4;

		case 9: // relativeBase += a
			if (debug) {
				console.log(`[${id}] ${String(pc).padStart(4)}:  ${z},${a}`);
				console.log(`[${id}]        relative base <${machine.relativeBase}> += ${showArg(a, aMode)}`);
			}
			machine.relativeBase += value(a, aMode);
			return pc + 2;

		case 99:
			if (debug) {
				console.log(`[${id}] ${String(pc).padStart(4)}:  ${z}`);
				console.log(`[${id}]        halt`);
			}
			return null;
	}

	function value(n, mode) {
		if (mode === 0) { return machine.mem[n] || 0; }
		if (mode === 1) { return n; }
		if (mode === 2) { return machine.mem[machine.relativeBase + n] || 0; }
		throw new Error(`invalid mode ${JSON.stringify(mode)} on rhs`);
	}

	function assign(n, mode, value) {
		if (mode === 0) { machine.mem[n] = value; return; }
		if (mode === 2) { machine.mem[machine.relativeBase + n] = value; return; }
		throw new Error(`invalid mode ${JSON.stringify(mode)} on lhs`);
	}

	function showArg(n, mode) {
		if (mode === 0) { return `[${n}]<${machine.mem[n] || 0}>`; }
		if (mode === 1) { return `${n}`; }
		if (mode === 2) { return `[${machine.relativeBase}+${n}]<${machine.mem[machine.relativeBase+n] || 0}>`; }
		throw new Error();
	}

	function showAssign(n, mode) {
		if (mode === 0) { return `[${n}]`; }
		if (mode === 2) { return `[${machine.relativeBase}+${n}]`; }
		throw new Error();
	}
}

(async function () {
	for (let [input, output] of tests) {
		assert.deepEqual(await run(input), output);
	}
	console.log(await run(input));
})();