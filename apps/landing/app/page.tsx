import { HappyCirclesMark, StoreButtonGrid } from './_components/brand-assets';
import { LandingOpenAppButton } from './_components/landing-open-app-button';

function FooterIcon({ kind }: Readonly<{ kind: 'privacy' | 'terms' | 'support' }>) {
  if (kind === 'privacy') {
    return (
      <svg className="footerIcon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.5 5.5 6v5.2c0 4.2 2.6 7.7 6.5 9.3 3.9-1.6 6.5-5.1 6.5-9.3V6L12 3.5Z" />
        <path d="M9.8 12.2 11.3 13.7 14.7 10.3" />
      </svg>
    );
  }

  if (kind === 'terms') {
    return (
      <svg className="footerIcon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3.5h7l3 3v14H7z" />
        <path d="M14 3.5v4h4" />
        <path d="M9.5 11h5" />
        <path d="M9.5 14.5h5" />
      </svg>
    );
  }

  return (
    <svg className="footerIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20a8 8 0 1 0-8-8" />
      <path d="M9.7 9.5a2.5 2.5 0 1 1 3.9 2.1c-.9.6-1.6 1.1-1.6 2.2" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <main className="landingShell">
      <section className="landingPanel" aria-labelledby="landing-title">
        <div className="brandStack">
          <HappyCirclesMark />
          <div className="brandCopy">
            <h1 id="landing-title">Happy Circles</h1>
            <p>
              Happy Circles es una aplicación para organizar gastos, deudas y pagos entre amigos
              de forma clara y segura.
            </p>
          </div>
        </div>

        <nav className="landingActions" aria-label="Descargar Happy Circles">
          <LandingOpenAppButton />
          <StoreButtonGrid />
          <div className="footerLinks" aria-label="Legal y soporte">
            <a href="/privacy">
              <FooterIcon kind="privacy" />
              Privacidad
            </a>
            <a href="/terms">
              <FooterIcon kind="terms" />
              Términos
            </a>
            <a href="/support">
              <FooterIcon kind="support" />
              Soporte
            </a>
          </div>
        </nav>
      </section>
    </main>
  );
}
