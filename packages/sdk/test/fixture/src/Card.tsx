/** Карточка — компонент для галереи. */
export function Card({ title, tone }: { title: string; tone?: string }) {
  return (
    <section className="card" data-testid="card" data-tone={tone ?? 'plain'} style={{ width: 200, height: 80 }}>
      <h2>{title}</h2>
    </section>
  );
}
