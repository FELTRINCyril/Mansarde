import type { ToolId } from '../store';
import { beamTool } from './beamTool';
import { calibrateTool } from './calibrateTool';
import { cupboardTool } from './cupboardTool';
import { dimensionTool } from './dimensionTool';
import { moveBackgroundTool } from './moveBackgroundTool';
import { doorTool, windowTool } from './openingTool';
import { rectRoomTool } from './rectRoomTool';
import { selectTool } from './selectTool';
import { slopeTool } from './slopeTool';
import type { Tool } from './types';
import { wallTool } from './wallTool';

/**
 * Tool implementations by id. Imported by the dispatchers only (PlanCanvas, keyboard.ts,
 * numericDispatch.ts), never by a tool: a tool importing it would close a module cycle.
 */
export const TOOLS: Partial<Record<ToolId, Tool>> = {
  select: selectTool,
  door: doorTool,
  window: windowTool,
  dimension: dimensionTool,
  calibrate: calibrateTool,
  moveBackground: moveBackgroundTool,
  wall: wallTool,
  rect: rectRoomTool,
  slope: slopeTool,
  beam: beamTool,
  cupboard: cupboardTool,
};
