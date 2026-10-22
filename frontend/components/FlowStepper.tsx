"use client";

import { useEffect, useState } from "react";

import { FLOW_STEPS, type StepId } from "@/lib/walkthrough";

import styles from "./FlowStepper.module.css";

const PIN_MS = 20000;

export interface FlowStepperProps {
  activeStep: StepId;
  pendingCount: number;
  canTrigger: boolean;
  onTrigger: () => void;
}

export default function FlowStepper({ activeStep, pendingCount, canTrigger, onTrigger }: FlowStepperProps) {
  // Clicking a step pins its explanation; the live view resumes after a while
  // or when "Back to live" is pressed.
  const [pinned, setPinned] = useState<StepId | null>(null);

  useEffect(() => {
    if (!pinned) return;
    const timer = setTimeout(() => setPinned(null), PIN_MS);
    return () => clearTimeout(timer);
  }, [pinned]);

  const shownId = pinned ?? activeStep;
  const shown = FLOW_STEPS.find((s) => s.id === shownId) ?? FLOW_STEPS[0];

  return (
    <div className={styles.stepper}>
      <ol className={styles.steps}>
        {FLOW_STEPS.map((step, index) => {
          const isShown = step.id === shownId;
          const isLive = step.id === activeStep;
          return (
            <li key={step.id} className={styles.item}>
              <button
                type="button"
                className={`${styles.step} ${isShown ? styles.active : ""} ${isLive && pinned ? styles.liveHint : ""}`}
                aria-pressed={pinned === step.id}
                aria-current={isLive ? "step" : undefined}
                onClick={() => setPinned(pinned === step.id ? null : step.id)}
                title={`Read how "${step.title}" works`}
              >
                <span className={styles.index} aria-hidden="true">
                  {index + 1}
                </span>
                {step.title}
                {step.id === "approve" && pendingCount > 0 && <span className={styles.waiting}>{pendingCount}</span>}
              </button>
            </li>
          );
        })}
      </ol>

      <div className={styles.caption}>
        <p className={styles.captionText} aria-live="polite">
          {pinned ? (
            <>
              <strong>{shown.title}.</strong> {shown.detail}{" "}
              <a href="#flow" className={styles.more}>
                Read the full walkthrough ↓
              </a>
            </>
          ) : (
            <>
              <strong>{shown.title}.</strong> {shown.short}
              {shown.id === "approve" && pendingCount > 0 ? " Your turn: approve or reject a card." : ""}{" "}
              <span className={styles.hint}>Click a step to learn more.</span>
            </>
          )}
        </p>
        {pinned ? (
          <button type="button" className={styles.back} onClick={() => setPinned(null)}>
            Back to live
          </button>
        ) : (
          canTrigger && (
            <button type="button" className={styles.trigger} onClick={onTrigger}>
              Trigger an incident
            </button>
          )
        )}
      </div>
    </div>
  );
}
