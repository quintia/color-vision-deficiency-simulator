const WHITE_XYZ = { x: 0.312713, y: 0.329016, z: 0.358271 };
const XYZ_FROM_RGB = [
  [0.430574, 0.34155, 0.178325],
  [0.222015, 0.706655, 0.07133],
  [0.020183, 0.129553, 0.93918]
];
const RGB_FROM_XYZ = [
  [3.063218, -1.393325, -0.475802],
  [-0.969243, 1.875966, 0.041555],
  [0.067871, -0.228834, 1.069251]
];

const FILTERS = {
  normal: null,
  deutan: {
    cp: { x: 1.14, y: -0.14 },
    ab: { x: 0.102776, y: 0.102864 },
    ae: { x: 0.505845 - 0.038, y: 0.493211 },
    anomalize: 1.0
  },
  deuteranomaly: {
    cp: { x: 1.14, y: -0.14 },
    ab: { x: 0.102776, y: 0.102864 },
    ae: { x: 0.505845 - 0.038, y: 0.493211 },
    anomalize: 0.66
  },
  protan: {
    cp: { x: 0.735, y: 0.265 },
    ab: { x: 0.115807, y: 0.073581 },
    ae: { x: 0.471899, y: 0.527051 },
    anomalize: 1.0
  },
  protanomaly: {
    cp: { x: 0.735, y: 0.265 },
    ab: { x: 0.115807, y: 0.073581 },
    ae: { x: 0.471899, y: 0.527051 },
    anomalize: 0.66
  },
  tritan: {
    cp: { x: 0.171, y: -0.003 },
    ab: { x: 0.045391, y: 0.294976 },
    ae: { x: 0.665764, y: 0.334011 },
    anomalize: 1.0
  },
  tritanomaly: {
    cp: { x: 0.171, y: -0.003 },
    ab: { x: 0.045391, y: 0.294976 },
    ae: { x: 0.665764, y: 0.334011 },
    anomalize: 0.66
  },
  monochrome: {
    monochrome: true
  }
};

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function multiplyMat3Vec3(mat, vec) {
  return {
    x: vec.x * mat[0][0] + vec.y * mat[0][1] + vec.z * mat[0][2],
    y: vec.x * mat[1][0] + vec.y * mat[1][1] + vec.z * mat[1][2],
    z: vec.x * mat[2][0] + vec.y * mat[2][1] + vec.z * mat[2][2]
  };
}

function safeDiv(numerator, denominator) {
  if (Math.abs(denominator) < 1e-6) return 0;
  return numerator / denominator;
}

function anomalizeAmount(rgb, anomalize) {
  const cmax = Math.max(rgb.x, rgb.y, rgb.z);
  const cmin = Math.min(rgb.x, rgb.y, rgb.z);
  const c = cmax - cmin;
  const v = cmax === 0 ? 1 : cmax;
  const saturation = c / v;
  const power = Math.pow(saturation, 7 * (1 - anomalize));
  return 1 - clamp01(power) * (1 - anomalize);
}

function hcirnSim(rgb, params) {
  const cRgb = { x: rgb.x, y: rgb.y, z: rgb.z };
  const cXyz = multiplyMat3Vec3(XYZ_FROM_RGB, cRgb);
  const sum = cXyz.x + cXyz.y + cXyz.z || 1;
  const cUv = { x: cXyz.x / sum, y: cXyz.y / sum };

  const scale = cXyz.y / WHITE_XYZ.y;
  const nXyz0 = { x: WHITE_XYZ.x * scale, y: WHITE_XYZ.y * scale, z: WHITE_XYZ.z * scale };

  const blindnessAm = (params.ae.y - params.ab.y) / (params.ae.x - params.ab.x);
  const blindnessAyi = params.ab.y - params.ab.x * blindnessAm;

  const clm = (params.cp.y - cUv.y) / (params.cp.x - cUv.x);
  const clyi = cUv.y - clm * cUv.x;

  const dUvX = (blindnessAyi - clyi) / (clm - blindnessAm);
  const dUvY = clm * dUvX + clyi;

  const dUDivDV = dUvX / dUvY;
  const sXyz0 = {
    x: cXyz.y * dUDivDV,
    y: cXyz.y,
    z: cXyz.y * (1 / dUvY - (dUDivDV + 1))
  };

  let sRgb = multiplyMat3Vec3(RGB_FROM_XYZ, sXyz0);

  const dXyz = { x: nXyz0.x - sXyz0.x, y: 0, z: nXyz0.z - sXyz0.z };
  const dRgb = multiplyMat3Vec3(RGB_FROM_XYZ, dXyz);

  const adj = {
    x: safeDiv(1 - sRgb.x, dRgb.x),
    y: safeDiv(1 - sRgb.y, dRgb.y),
    z: safeDiv(1 - sRgb.z, dRgb.z)
  };

  const adjSigned = {
    x: Math.sign(1 - adj.x) * adj.x,
    y: Math.sign(1 - adj.y) * adj.y,
    z: Math.sign(1 - adj.z) * adj.z
  };

  const adjust = Math.max(0, adjSigned.x, adjSigned.y, adjSigned.z);

  sRgb = {
    x: clamp01(sRgb.x + adjust * dRgb.x),
    y: clamp01(sRgb.y + adjust * dRgb.y),
    z: clamp01(sRgb.z + adjust * dRgb.z)
  };

  const mixAmount = anomalizeAmount(cRgb, params.anomalize);

  return {
    x: cRgb.x + (sRgb.x - cRgb.x) * mixAmount,
    y: cRgb.y + (sRgb.y - cRgb.y) * mixAmount,
    z: cRgb.z + (sRgb.z - cRgb.z) * mixAmount
  };
}

function applyCvdFilter(imageData, name) {
  const params = FILTERS[name];
  const output = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );

  const data = output.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    let out;
    if (!params || name === "normal") {
      out = { x: r, y: g, z: b };
    } else if (params.monochrome) {
      const m = r * 0.299 + g * 0.587 + b * 0.114;
      out = { x: m, y: m, z: m };
    } else {
      out = hcirnSim({ x: r, y: g, z: b }, params);
    }

    data[i] = clamp01(out.x) * 255;
    data[i + 1] = clamp01(out.y) * 255;
    data[i + 2] = clamp01(out.z) * 255;
  }

  return output;
}

export { FILTERS, applyCvdFilter };
