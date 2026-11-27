import * as THREE from 'three';
import type { StatueConfig, StatueStats, StatueTemplate } from './types';

export interface StatuePart {
  name: string;
  bucket: string;
  start: number;
  count: number;
  grounded?: boolean;
}

export interface StatueContact {
  upper: string;
  lower: string;
}

export function createStatue(config: StatueConfig, template?: StatueTemplate | { id: string }, options?: { textures?: boolean }): THREE.Group & {
  userData: {
    stats: StatueStats;
    parts: StatuePart[];
    contacts: StatueContact[];
    dispose: () => void;
  };
};

export default createStatue;
