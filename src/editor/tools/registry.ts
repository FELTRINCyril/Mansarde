import type { ToolId } from '../store';
import { calibrateTool } from './calibrateTool';
import { dimensionTool } from './dimensionTool';
import { moveBackgroundTool } from './moveBackgroundTool';
import { doorTool, windowTool } from './openingTool';
import { rectRoomTool } from './rectRoomTool';
import { selectTool } from './selectTool';
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
};
