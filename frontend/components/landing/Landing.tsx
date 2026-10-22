import Link from "next/link";

import DemoStage from "@/components/DemoStage";

import Agents from "./Agents";
import Architecture from "./Architecture";
import Flow from "./Flow";
import Safety from "./Safety";
import Stack from "./Stack";
import styles from "./landing.module.css";

const REPO_URL = "https://github.com/Sakar1601/cloudsentry";
const AUTHOR_URL = "https://github.com/Sakar1601";

export default function Landing() {
  return (
    <div className={styles.page}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>

      <header className={styles.nav}>
        <div className={`${styles.container} ${styles.navInner}`}>
          <Link href="/" className={styles.brand}>
            <span className={styles.mark} aria-hidden="true" />
            Cloudsentry
          </Link>
          <nav className={styles.navLinks} aria-label="Sections">
            <a href="#flow">How it works</a>
            <a href="#agents">Agents</a>
            <a href="#safety">Safety</a>
            <a href="#architecture">Architecture</a>
            <a href="#stack">Stack</a>
          </nav>
          <div className={styles.navActions}>
            <a href={REPO_URL} className={styles.navGhost} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link href="/demo" className={styles.navCta}>
              Open full demo
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className={styles.hero}>
          <div className={styles.container}>
            <h1 className={styles.h1}>Your AWS account, watched by three AI&nbsp;agents.</h1>
            <p className={styles.lead}>
              Cloudsentry draws your cloud as a live graph. Cost, Performance and Security agents move across it, call
              real AWS APIs, explain what they find, and propose the fix. Nothing changes until a human approves it.
            </p>
            <div className={styles.ctaRow}>
              <a href="#live" className={styles.primary}>
                Watch it work
              </a>
              <a href={REPO_URL} className={styles.secondary} target="_blank" rel="noreferrer">
                Read the source
              </a>
            </div>
            <ul className={styles.proof}>
              <li>Run end to end against a real AWS account</li>
              <li>149 automated tests</li>
              <li>Deployable with Terraform</li>
            </ul>
          </div>
        </section>

        <section id="live" className={styles.stageSection} aria-label="Live demo">
          <div className={`${styles.container} ${styles.stageWrap}`}>
            <DemoStage variant="hero" />
            <p className={styles.stageCaption}>
              This is the real interface running on a simulated account, entirely in your browser. Click a node,
              approve or reject a proposal, or press <strong>Trigger an incident</strong> to skip the wait.{" "}
              <Link href="/demo">Open it full screen →</Link>
            </p>
          </div>
        </section>

        <Flow />
        <Agents />
        <Safety />
        <Architecture />
        <Stack />

        <section className={styles.final}>
          <div className={styles.container}>
            <h2 className={styles.finalTitle}>See it for yourself.</h2>
            <p className={styles.finalLead}>
              Open the full-screen graph and run an incident, or read how it is built.
            </p>
            <div className={styles.ctaRow}>
              <Link href="/demo" className={styles.primary}>
                Open the full demo
              </Link>
              <a href={REPO_URL} className={styles.secondary} target="_blank" rel="noreferrer">
                View on GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.container} ${styles.footerInner}`}>
          <span>
            Cloudsentry, built by{" "}
            <a href={AUTHOR_URL} target="_blank" rel="noreferrer">
              Sakar Joshi
            </a>
            .
          </span>
          <span className={styles.footerLinks}>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              Source
            </a>
            <Link href="/audit">Audit log</Link>
            <Link href="/demo">Live graph</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
