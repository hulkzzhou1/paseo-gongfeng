import { defineSettings } from '@getpaseo/plugin';
import { z } from 'zod';
export const workbenchSettings=defineSettings({id:'workbench',scope:'host',version:1,
 schema:z.object({autoRefreshSeconds:z.union([z.literal(0),z.literal(30),z.literal(60),z.literal(120),z.literal(300)]).default(0)}).strict()});
