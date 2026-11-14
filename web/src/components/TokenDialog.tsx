"use client";

import { useState } from "react";

import { getToken, setToken } from "@/lib/token";

import { KeyIcon } from "./icons";
import { Modal } from "./Modal";
import { useMint } from "./MintProvider";
import { Button, IconButton } from "./ui";
import { INPUT } from "./bits";

/** The moderator token for this tab. argus-mint decides whether it is right. */
export function TokenButton() {
  const { hasToken } = useMint();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  return (
    <>
      <IconButton
        label={hasToken ? "Moderator token set" : "Set the moderator token"}
        onClick={() => {
          setValue(getToken());
          setOpen(true);
        }}
        className={hasToken ? "text-success" : ""}
      >
        <KeyIcon />
      </IconButton>
      <Modal open={open} onClose={() => setOpen(false)} label="Moderator token" className="mt-24 w-[calc(100%-2rem)] max-w-md">
        <form
          className="space-y-3 rounded-lg border border-base-600 bg-base-800 p-4 shadow-soft"
          onSubmit={(e) => {
            e.preventDefault();
            setToken(value.trim());
            setOpen(false);
          }}
        >
          <h2 className="font-display text-subheading font-semibold">Moderator token</h2>
          <p className="text-small text-text-secondary">
            The token argus-mint was started with (<code>ARGUS_MINT_MODERATOR_TOKEN</code>). It lets you create drafts, render samples, review as
            the moderator, approve templates and frames, and publish. It is kept for this tab only.
          </p>
          <input type="password" autoComplete="off" aria-label="Moderator token" className={INPUT} value={value} onChange={(e) => setValue(e.target.value)} placeholder="token" data-autofocus />
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                setToken("");
                setOpen(false);
              }}
            >
              Forget
            </Button>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <button type="submit" className="rounded-md bg-interactive px-3.5 py-2 text-small font-medium text-white hover:bg-interactive-hover">
              Save
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
