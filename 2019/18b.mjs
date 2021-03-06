import assert from 'assert';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { getRawInput } from '../lib.mjs';
const input = getRawInput();
const tests = [];

class PriorityQueue {
	constructor() {
		this.data = [];
		this.priorities = [];
		this.length = this.data.length;
	}

	push(item, priority) {
		let index = this.priorities.findIndex(p => p > priority);
		if (index === -1) {
			this.data.push(item);
			this.priorities.push(priority);
		} else {
			this.data.splice(index, 0, item);
			this.priorities.splice(index, 0, priority);
		}
		this.length = this.data.length;
	}

	pop() {
		const result = this.data.shift();
		this.priorities.shift();
		this.length = this.data.length;
		return result;
	}
}

function astar({ start, goal, key, neighbors, cost, heuristic, debug }) {
	let record = 0;

	const parents = new Map();

	const gScores = new Map();
	gScores.set(key(start), 0);
	
	const fScores = new Map();
	fScores.set(key(start), heuristic(start, goal));

	const keyGoal = key(goal);

	const openSet = new PriorityQueue();
	openSet.push(start, heuristic(start, goal));

	while (openSet.length) {
		const current = openSet.pop();
		if (debug) {
			debug(current, openSet);	
		}

		const keyCurrent = key(current);

		if (keyCurrent === keyGoal) {
			return getPath(parents, current);
		}

		for (let neighbor of neighbors(current)) {
			const keyNeighbor = key(neighbor);
			const gScore = gScores.get(keyCurrent) + cost(current, neighbor);
			if (!gScores.has(keyNeighbor) ||
				gScores.get(keyNeighbor) > gScore
			) {
				const hScore = heuristic(neighbor, goal);
				parents.set(keyNeighbor, current);
				gScores.set(keyNeighbor, gScore);
				fScores.set(keyNeighbor, gScore + hScore);
				openSet.push(neighbor, gScore + hScore);
			}
		}
	}

	return false;

	function getPath(parents, current) {
		const path = [current];
		let totalCost = 0;
		while (parents.has(key(current))) {
			const parent = parents.get(key(current));
			totalCost += cost(parent, current);
			path.unshift(parent);
			current = parent;
		}
		return { path, cost: totalCost };
	}
}

function findPoints(input) {
	const re = /[a-z!@$%]/g;
	const result = [];
	let match;
	while (match = re.exec(input)) {
		result[match[0]] = match.index;
	}
	return result;
}

function findPaths(input, points) {
	const w = input.indexOf('\n');
	const h = (input.length + 1) / (w + 1);

	const paths = {};
	const keys = Object.keys(points);
	for (let i = 0; i < keys.length; ++i) {
		for (let j = i + 1; j < keys.length; ++j) {
			const a = keys[i];
			const b = keys[j];

			const path = astar({
				start: points[a],
				goal: points[b],
				key: x => x,
				neighbors: pos => neighbors(input, pos),
				cost: () => 1,
				heuristic: (pos, goal) => heuristic(input, pos, goal)
			});

			if (path) {
				if (!paths[a]) paths[a] = {};
				if (!paths[b]) paths[b] = {};
				paths[a][b] = path;
				paths[b][a] = path;
			}
		}
	}

	return paths;
}

function neighbors(input, pos) {
	const w = input.indexOf('\n');
	const h = (input.length + 1) / (w + 1);
	const x = pos % (w + 1);
	const y = pos / (w + 1) | 0;

	const result = [];
	if (x > 0 && input[y*(w+1) + (x-1)] !== '#') {
		result.push(y*(w+1) + (x-1));
	}
	if (x < w-1 && input[y*(w+1) + (x+1)] !== '#') {
		result.push(y*(w+1) + (x+1));
	}
	if (y > 0 && input[(y-1)*(w+1) + x] !== '#') {
		result.push((y-1)*(w+1) + x);
	}
	if (y < h-1 && input[(y+1)*(w+1) + x] !== '#') {
		result.push((y+1)*(w+1) + x);
	}
	return result;
}

function heuristic(input, pos, goal) {
	const w = input.indexOf('\n');
	const h = (input.length + 1) / (w + 1);
	const x = pos % (w + 1);
	const y = pos / (w + 1) | 0;

	const tx = goal % (w + 1);
	const ty = goal / (w + 1) | 0;

	return Math.abs(tx - x) + Math.abs(ty - y);
}

function makePathTree(input) {
	let start = -1;
	const visited = new Set();
	const results = {};

	bfs(input.indexOf('!'));
	bfs(input.indexOf('@'));
	bfs(input.indexOf('$'));
	bfs(input.indexOf('%'));

	function bfs(start) {
		let openSet = [{ n: start, parent: null }];
		while (openSet.length) {
			const current = openSet.shift();
			if (visited.has(current.n)) continue;
			visited.add(current.n);
			let parent = current.parent;

			if (input[current.n] !== '.') {
				results[input[current.n]] = { id: input[current.n], parent, children: [] };
				parent = input[current.n];
			}
			const next = neighbors(input, current.n);
			openSet.push(...next.map(n => ({ n, parent })));
		}
	}

	for (let result of Object.values(results)) {
		if (result.parent == null) continue;
		const parent = Object.values(results).find(r => r.id === result.parent);
		parent.children.push(result.id);
	}

	return results;
}

function findMetaPath(tree, paths) {
	const start = { current: ['!', '@', '$', '%'], path: '@', keys: new Set() };
	const goal = { done: true };
	let record = 0;
	return astar({
		start,
		goal,
		key: state => state.done ?
			'DONE' :
			`${state.current.join('')}|${[...state.keys].sort().join('')}`,
		neighbors: state => {
			const result = [];

			traverseChildren(result, tree['!'], 0);
			traverseChildren(result, tree['@'], 1);
			traverseChildren(result, tree['$'], 2);
			traverseChildren(result, tree['%'], 3);

			return result.length ? result : [{ done: true }];

			function traverseChildren(result, node, currentIndex) {
				for (let child of node.children) {
					// traverse through open doors and picked up keys
					if (state.keys.has(child.toLowerCase())) {
						traverseChildren(result, tree[child], currentIndex);
					}
					// stop at new keys
					else if (/[a-z]/.test(child)) {
						const newCurrent = [...state.current];
						newCurrent[currentIndex] = child;
						result.push({
							current: newCurrent,
							path: state.path + child,
							keys: new Set([child, ...state.keys])
						});
					}
				}
			}
		},
		heuristic: () => 0,
		cost: (a, b) => {
			if (b.done) return 0;

			for (let i = 0; i < a.current.length; ++i) {
				if (a.current[i] !== b.current[i]) {
					return paths[a.current[i]][b.current[i]].cost;
				}
			}
		},
		// debug: (state, openSet) => {
		// 	if (state.path && state.path.length > record) {
		// 		record = state.path.length;
		// 		console.log(state.path.length, state.path, openSet.data.length);
		// 	}
		// }
		// debug: state => console.log(state.path)
	});
}

function updateInput(input) {
	const center = input.indexOf('@');
	const w = input.indexOf('\n');
	const h = (input.length + 1) / (w + 1);

	input = input.slice(0, center - (w + 1) - 1) + '!#@' + input.slice(center - (w + 1) + 2);
	input = input.slice(0, center           - 1) + '###' + input.slice(center           + 2);
	input = input.slice(0, center + (w + 1) - 1) + '$#%' + input.slice(center + (w + 1) + 2);

	return input;
}

async function run(input) {
	input = updateInput(input);
	console.log(input);
	const tree = makePathTree(input);
	const points = findPoints(input);
	const paths = findPaths(input, points);	
	const meta = findMetaPath(tree, paths);
	console.log(meta);
	return meta.cost;
}

(async function () {
	for (let [input, output] of tests) {
		assert.deepEqual(await run(input), output);
	}
	console.log(await run(input));
})();
