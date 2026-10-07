import type { JSX, ReactNode } from 'react';
import { useEditor, type ToolId } from '@/editor/store';

interface ToolButton { id: ToolId; label: string; key: string; icon: ReactNode }

const icon = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const TOOL_BUTTONS: ToolButton[] = [
  { id: 'select', label: 'Sélection', key: 'V', icon: icon(<path d="M5 3l13 8-6 1.5L9 19z" />) },
  { id: 'wall', label: 'Mur', key: 'M', icon: icon(<path d="M3 17h7V7h11" strokeWidth="3.5" strokeLinecap="butt" strokeLinejoin="miter" />) },
  { id: 'rect', label: 'Pièce rectangulaire', key: 'R', icon: icon(<rect x="4" y="5" width="16" height="14" strokeWidth="3" />) },
  {
    id: 'door',
    label: 'Porte',
    key: 'P',
    icon: icon(
      <>
        <path d="M3 20h4M17 20h4" strokeWidth="3" strokeLinecap="butt" />
        <path d="M7 20V8" />
        <path d="M7 8a12 12 0 0 1 10 12" strokeDasharray="2 2" />
      </>,
    ),
  },
  {
    id: 'window',
    label: 'Fenêtre',
    key: 'F',
    icon: icon(
      <>
        <path d="M2 12h4M18 12h4" strokeWidth="4" strokeLinecap="butt" />
        <path d="M6 10h12M6 14h12M12 10v4" />
      </>,
    ),
  },
  {
    id: 'dimension',
    label: 'Cote',
    key: 'C',
    icon: icon(
      <>
        <path d="M4 15h16M4 11v8M20 11v8" />
        <text x="12" y="10" fontSize="7" textAnchor="middle" fill="currentColor" stroke="none">
          3,5
        </text>
      </>,
    ),
  },
];

/** Vertical tool bar; the active tool is highlighted (aria-pressed). */
export function Toolbar(): JSX.Element {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  return (
    <nav className="toolbar" aria-label="Outils">
      {TOOL_BUTTONS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={tool === t.id ? 'tool tool-active' : 'tool'}
          aria-pressed={tool === t.id}
          aria-label={t.label}
          title={`${t.label} (${t.key})`}
          data-testid={`tool-${t.id}`}
          // keep the focus where it is: the space key must keep panning the plan, not press the button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setTool(t.id)}
        >
          {t.icon}
          <span className="tool-key">{t.key}</span>
        </button>
      ))}
    </nav>
  );
}
