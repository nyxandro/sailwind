import { ShaderChunk } from 'three';
import { smoothstep } from './world.js';

const CLEAR_DEPTH = 3;
const VANISH_DEPTH = 24;
const BLUR_PER_METRE = 0.6;

export function shadowAtDepth(depth) {
  return { strength: 1 - smoothstep(CLEAR_DEPTH, VANISH_DEPTH, depth), radius: 1 + Math.max(0, depth) * BLUR_PER_METRE };
}

export function applyDepthShadows(material) {
  const signature = 'float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {';
  if (!ShaderChunk.shadowmap_pars_fragment.includes(signature)) throw new Error('DEPTH_SHADOW_SHADER_CHANGED: Three.js PCF shadow interface needs updating');
  const shadowChunk = ShaderChunk.shadowmap_pars_fragment.replace(signature, `${signature}
    if (seabedShadowDepth >= ${VANISH_DEPTH.toFixed(1)}) return 1.0;
    shadowIntensity *= 1.0 - smoothstep(${CLEAR_DEPTH.toFixed(1)}, ${VANISH_DEPTH.toFixed(1)}, seabedShadowDepth);
    shadowRadius += seabedShadowDepth * ${BLUR_PER_METRE.toFixed(1)};`);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying float seabedShadowDepth;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nseabedShadowDepth = max(0.0, -(modelMatrix * vec4(transformed, 1.0)).y);');
    shader.fragmentShader = 'varying float seabedShadowDepth;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', shadowChunk);
  };
}
