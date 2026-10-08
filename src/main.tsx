import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'
import { ErrorBoundary } from './ui/ErrorBoundary'

/** Last resort: an error no inner boundary caught. The projects are safe in the browser storage. */
const AppError = () => (
  <div className="app-error" role="alert" data-testid="app-error">
    <h1 className="home-title">Plan Maison</h1>
    <p>Une erreur inattendue empêche l'affichage. Vos projets restent enregistrés dans le navigateur.</p>
    <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
      Recharger la page
    </button>
  </div>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={() => <AppError />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
