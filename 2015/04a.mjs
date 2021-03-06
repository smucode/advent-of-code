import crypto from 'crypto';
import fs from 'fs';
const input = fs.readFileSync('04.txt', 'utf-8').trim();

function hash(string) {
	return crypto.createHash('md5').update(string).digest('hex');
}

function run(input) {
	for (let i = 0; ; ++i) {
		if (/^00000/.test(hash(input + i))) {
			return i;
		}
	}
}

console.log(run(input));
