import assert from 'node:assert/strict';
import test from 'node:test';
import { grainSample } from '../src/js/modules/effects/grain-noise.js';

/**
 * @param {number[][]} field
 * @param {number} lagX
 * @param {number} lagY
 * @returns {number}
 */
function correlation(field, lagX, lagY) {
	const height = field.length;
	const width = field[0].length;
	let count = 0;
	let sumA = 0;
	let sumB = 0;
	let sumProd = 0;
	let sumA2 = 0;
	let sumB2 = 0;
	for (let y = 0; y < height - lagY; y += 1) {
		for (let x = 0; x < width - lagX; x += 1) {
			const a = field[y][x];
			const b = field[y + lagY][x + lagX];
			sumA += a;
			sumB += b;
			sumProd += a * b;
			sumA2 += a * a;
			sumB2 += b * b;
			count += 1;
		}
	}
	const meanA = sumA / count;
	const meanB = sumB / count;
	const covariance = sumProd / count - meanA * meanB;
	const varianceA = sumA2 / count - meanA * meanA;
	const varianceB = sumB2 / count - meanB * meanB;
	return covariance / Math.sqrt(Math.max(1e-9, varianceA * varianceB));
}

test('Effect 颗粒噪声不会形成棋盘条纹', () => {
	const width = 64;
	const height = 64;
	const seed = 2166136261;
	const field = Array.from({ length: height }, (_, y) => (
		Array.from({ length: width }, (_, x) => grainSample(x, y, seed))
	));
	for (const [lagX, lagY] of [[1, 0], [0, 1], [8, 0], [0, 8], [17, 0], [0, 17]]) {
		assert.ok(
			Math.abs(correlation(field, lagX, lagY)) < 0.15,
			`lag ${lagX},${lagY} correlation too high`,
		);
	}
});
