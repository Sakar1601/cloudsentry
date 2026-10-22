"use client";

import { useState } from "react";

import { setToken } from "@/lib/auth";

import styles from "./TokenGate.module.css";

/** Shown when the API requires a token. Stores it for this session and reloads. */
export default function TokenGate() {
  const [value, setValue] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    setToken(value);
    window.location.reload();
  }

  return (
    <form className={styles.gate} onSubmit={submit}>
      <h2 className={styles.title}>This Cloudsentry API is protected</h2>
      <p className={styles.body}>
        Enter the operator token (the value of <code>CLOUDSENTRY_API_TOKEN</code> on the server). It is kept for this
        browser session only.
      </p>
      <label className={styles.label} htmlFor="api-token">
        API token
      </label>
      <input
        id="api-token"
        className={styles.input}
        type="password"
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button className={styles.button} type="submit" disabled={!value.trim()}>
        Unlock
      </button>
    </form>
  );
}
