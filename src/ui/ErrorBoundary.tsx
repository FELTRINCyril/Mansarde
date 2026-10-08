import { Component, type ErrorInfo, type JSX, type ReactNode } from 'react';

interface Props {
  /** What to show instead of the children once they threw while rendering. */
  fallback(error: Error): ReactNode;
  /** The children are rendered again when this value changes (e.g. the project after an undo). */
  resetKey?: unknown;
  children: ReactNode;
}

interface State { error: Error | null; key: unknown }

/**
 * Catches a rendering error of its children (ruling R37): only this part of the screen is replaced
 * by the fallback, the rest of the app keeps working. React has no hook for this, hence the class.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.key ? null : { error: null, key: props.resetKey };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Rendering error caught by an error boundary', error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}

/** Last resort around the whole app (main.tsx): an error no inner boundary caught. The projects are safe in the browser storage. */
export function AppError(): JSX.Element {
  return (
    <div className="app-error" role="alert" data-testid="app-error">
      <h1 className="home-title">Plan Maison</h1>
      <p>Une erreur inattendue empêche l'affichage. Vos projets restent enregistrés dans le navigateur.</p>
      <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
        Recharger la page
      </button>
    </div>
  );
}
