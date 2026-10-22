import { FLOW_STEPS, type StepId } from "@/lib/walkthrough";

import styles from "./FlowStepper.module.css";

export interface FlowStepperProps {
  activeStep: StepId;
  pendingCount: number;
  canTrigger: boolean;
  onTrigger: () => void;
}

export default function FlowStepper({ activeStep, pendingCount, canTrigger, onTrigger }: FlowStepperProps) {
  const active = FLOW_STEPS.find((s) => s.id === activeStep) ?? FLOW_STEPS[0];

  return (
    <div className={styles.stepper}>
      <ol className={styles.steps}>
        {FLOW_STEPS.map((step, index) => {
          const isActive = step.id === activeStep;
          return (
            <li key={step.id} className={`${styles.step} ${isActive ? styles.active : ""}`} aria-current={isActive ? "step" : undefined}>
              <span className={styles.index} aria-hidden="true">
                {index + 1}
              </span>
              {step.title}
              {step.id === "approve" && pendingCount > 0 && <span className={styles.waiting}>{pendingCount}</span>}
            </li>
          );
        })}
      </ol>

      <div className={styles.caption}>
        <p className={styles.captionText} aria-live="polite">
          <strong>{active.title}.</strong> {active.short}
          {active.id === "approve" && pendingCount > 0 ? " Your turn: approve or reject a card." : ""}
        </p>
        {canTrigger && (
          <button type="button" className={styles.trigger} onClick={onTrigger}>
            Trigger an incident
          </button>
        )}
      </div>
    </div>
  );
}
