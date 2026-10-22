// Pantallas que todavía no existen: cada una dice qué PR la trae.
export default function Placeholder({ title, comingIn }: { title: string; comingIn: string }) {
  return (
    <main>
      <header className="page-header">
        <h1>{title}</h1>
      </header>
      <p className="muted">Llega en {comingIn}.</p>
    </main>
  )
}
