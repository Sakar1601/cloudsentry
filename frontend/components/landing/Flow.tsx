import { FLOW_STEPS } from "@/lib/walkthrough";

import styles from "./landing.module.css";

export default function Flow() {
  return (
    <section id="flow" className={styles.section}>
      <div className={`${styles.container} ${styles.split}`}>
        <div className={styles.sticky}>
          <h2 className={styles.h2}>One cycle, five steps.</h2>
          <p className={styles.sectionLead}>
            The same loop you just watched, written out. Each step names the real code that does the work, so you can
            follow it in the repository.
          </p>
        </div>

        <ol className={styles.flowList}>
          {FLOW_STEPS.map((step, index) => (
            <li key={step.id} className={styles.flowItem}>
              <span className={styles.flowIndex} aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <h3 className={styles.h3}>{step.title}</h3>
                <p className={styles.body}>{step.detail}</p>
                <p className={styles.codeLine}>{step.backend}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
