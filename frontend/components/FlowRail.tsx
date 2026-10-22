import { FLOW_STEPS, type StepId } from "@/lib/walkthrough";

import styles from "./FlowRail.module.css";

export interface FlowRailProps {
  activeStep: StepId;
  pendingCount: number;
  canTrigger: boolean;
  onTrigger: () => void;
}

export default function FlowRail({ activeStep, pendingCount, canTrigger, onTrigger }: FlowRailProps) {
  return (
    <div className={styles.rail}>
      <div className={styles.head}>
        <h2 className={styles.title}>What's happening right now</h2>
        <p className={styles.sub}>
          This is the live product, not a recording. The step that lights up is the one the system is in.
        </p>
      </div>

      <ol className={styles.steps}>
        {FLOW_STEPS.map((step, index) => {
          const active = step.id === activeStep;
          return (
            <li key={step.id} className={`${styles.step} ${active ? styles.active : ""}`} aria-current={active ? "step" : undefined}>
              <span className={styles.index} aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <p className={styles.stepTitle}>
                  {step.title}
                  {step.id === "approve" && pendingCount > 0 && (
                    <span className={styles.waiting}>{pendingCount} waiting on you</span>
                  )}
                </p>
                <p className={styles.stepShort}>{step.short}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {canTrigger && (
        <div className={styles.foot}>
          <button type="button" className={styles.trigger} onClick={onTrigger}>
            Trigger an incident
          </button>
          <p className={styles.hint}>Spikes cost and latency so all three agents react within seconds.</p>
        </div>
      )}
    </div>
  );
}
