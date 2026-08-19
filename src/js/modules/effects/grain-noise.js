/**
 * 生成无网格条纹的胶片颗粒样本，约在 -8 到 7。
 * 旧实现用 (x*C)^(y*C)%17，整数折返后会留下棋盘/竖条，多次套用会叠成明显纹路。
 * @param {number} x
 * @param {number} y
 * @param {number} seed
 * @returns {number}
 */
export function grainSample(x, y, seed) {
	let n = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ (seed | 0);
	n = Math.imul(n ^ (n >>> 13), 1274126177);
	n = Math.imul(n ^ (n >>> 16), 2246822519);
	return ((n >>> 8) & 15) - 8;
}

// Base_gui 会实例化本目录每个模块的 default export。
export default class Effect_grainNoise_class {}
