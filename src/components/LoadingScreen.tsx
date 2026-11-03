export function LoadingScreen({ message = 'Carregando…' }: { message?: string }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="spinner spinner-lg" aria-hidden />
      <p>{message}</p>
    </div>
  )
}
