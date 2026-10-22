import DemoStage from "@/components/DemoStage";
import Header from "@/components/Header";

import styles from "./AppView.module.css";

export default function AppView() {
  return (
    <main className={styles.main}>
      <Header active="graph" />
      <DemoStage variant="app" />
    </main>
  );
}
