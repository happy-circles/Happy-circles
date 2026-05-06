import { HappyCirclesMark, StoreButtonGrid } from './_components/brand-assets';

export default function LandingPage() {
  return (
    <main className="landingShell">
      <section className="landingPanel" aria-labelledby="landing-title">
        <div className="brandStack">
          <HappyCirclesMark />
          <div className="brandCopy">
            <h1 id="landing-title">Happy Circles</h1>
            <ul className="landingHighlights" aria-label="Beneficios principales">
              <li>Saldos confirmados por ambas partes</li>
              <li>Invitaciones privadas para cada círculo</li>
            </ul>
          </div>
        </div>

        <nav className="landingActions" aria-label="Descargar Happy Circles">
          <a className="primaryButton" href="/download">
            Abrir Happy Circles
          </a>
          <StoreButtonGrid />
          <div className="footerLinks" aria-label="Legal y soporte">
            <a href="/privacy">Privacidad</a>
            <a href="/terms">Términos</a>
            <a href="/support">Soporte</a>
          </div>
        </nav>
      </section>
    </main>
  );
}
