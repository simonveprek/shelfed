"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
// Installed alongside, in the same folder.
import { AURA_PALETTES, Aura, type AuraColors } from "./aura";
import { isLightColor, rounded, useTheme } from "./theme";

/**
 * Composer. The prompt box an AI app needs. It grows as you write, takes
 * files by drop, paste or its plus menu, where skills and your own actions
 * live too. It picks a model with each provider's mark and how hard it should
 * think, and turns speech into
 * text while Aura glows round its edge with your voice. While the model
 * answers, send becomes stop. Needs React, Framer Motion and aura.tsx beside
 * it. No Tailwind required. It takes its colours from the text around it.
 *
 *   <Composer
 *     onSubmit={({ text, files, model, skills }) => send(text, files, model)}
 *     busy={answering}
 *     onStop={stop}
 *     models={[
 *       { id: "sonnet", name: "Claude Sonnet", provider: "anthropic" },
 *       { id: "gpt", name: "GPT", provider: "openai" },
 *     ]}
 *     skills={[{ id: "brief", name: "Brief", note: "Short answers" }]}
 *     efforts={["Low", "Medium", "High"]}
 *     tools={<Context used={tokens} limit={200_000} />}
 *   />
 *
 * Fragms 2.1.0. MIT License, Copyright (c) 2026 Šimon Vepřek.
 * https://github.com/simonveprek/fragms
 */

/** Companies whose marks come built in. */
export const COMPOSER_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "meta",
  "mistral",
  "deepseek",
] as const;

export type ComposerProvider = (typeof COMPOSER_PROVIDERS)[number];

export type ComposerModel = {
  id: string;
  name: string;
  /** A few words under the name in the menu. */
  note?: string;
  /** Shows the company's mark beside the name. */
  provider?: ComposerProvider;
  /** Your own mark, instead of a provider's. */
  icon?: ReactNode;
  /** A short word beside the name, like Pro or Fast. */
  tag?: string;
  /** A heading the model sits under in the menu. */
  group?: string;
  /** Shown, but not yet for choosing. */
  disabled?: boolean;
  /** Off for a model that does not think, so the effort setting hides. */
  effort?: boolean;
};

/** A way of working the model takes on, picked from the plus menu. */
export type ComposerSkill = {
  id: string;
  name: string;
  note?: string;
  icon?: ReactNode;
};

/** Anything else for the plus menu, like making an image. */
export type ComposerAction = {
  id: string;
  label: string;
  note?: string;
  icon?: ReactNode;
  onSelect: () => void;
};

export type ComposerMessage = {
  text: string;
  files: File[];
  model?: string;
  /** The ids of the skills picked for this message. */
  skills: string[];
  /** How hard the model should think, when there is an effort setting. */
  effort?: string;
};

export type ComposerProps = {
  onSubmit?: (message: ComposerMessage) => void;
  /** The model is answering. Send turns into stop. */
  busy?: boolean;
  onStop?: () => void;
  /** The hint in the empty box. Give several and they take turns. */
  placeholder?: string | string[];
  defaultValue?: string;
  /** The text, when you want to hold it yourself. Pair it with onValueChange. */
  value?: string;
  onValueChange?: (text: string) => void;
  models?: ComposerModel[];
  /** The chosen model. Left out, the Composer remembers it itself. */
  model?: string;
  onModelChange?: (id: string) => void;
  /** Levels of thinking to pick from in the model menu, lightest first. */
  efforts?: string[];
  /** The chosen effort. Left out, the Composer remembers it itself. */
  effort?: string;
  onEffortChange?: (effort: string) => void;
  /** Lets people add files. */
  attachments?: boolean;
  /** Skills to pick from the plus menu. Picked ones sit in the toolbar. */
  skills?: ComposerSkill[];
  /** The picked skills, when you want to hold them yourself. */
  activeSkills?: string[];
  onSkillsChange?: (ids: string[]) => void;
  /** More rows for the plus menu. */
  actions?: ComposerAction[];
  /** Which files it takes, as in an input's accept. */
  accept?: string;
  /** Speech to text, where the browser supports it. */
  voice?: boolean;
  /** The language voice listens for. Left out, the page's own. */
  lang?: string;
  /** The send button and the focus ring. */
  color?: string;
  /** Aura's colours while it listens. Four, or fewer to repeat. */
  glow?: string[];
  /** Text above the buttons, or everything on one line. */
  layout?: "stacked" | "inline";
  /** A soft tint, a plain outline, a solid card, or frosted glass. */
  variant?: "soft" | "outline" | "solid" | "glass";
  size?: "small" | "medium" | "large";
  /** Corner radius in pixels. Left out, it follows the size. */
  radius?: number;
  sendIcon?: "arrow" | "plane" | "sparkle";
  /** A limit on the text, with a count that shows as it gets close. */
  maxLength?: number;
  /** Enter sends and Shift and Enter makes a new line. Off, Enter always makes a new line. */
  submitOnEnter?: boolean;
  /** A ring in the colour while it has focus. */
  focusRing?: boolean;
  /** Anything else for the toolbar, beside send. A Context ring fits well. */
  tools?: ReactNode;
  /** Tallest it grows before it scrolls, in pixels. */
  maxHeight?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  style?: CSSProperties;
};

type Attached = { id: string; file: File; url?: string };
type Scale = {
  font: number;
  button: number;
  icon: number;
  pad: number;
  radius: number;
};

const EASE = [0.22, 1, 0.36, 1] as const;
const noSubscribe = () => () => {};
const SIZES: Record<NonNullable<ComposerProps["size"]>, Scale> = {
  small: { font: 14, button: 30, icon: 16, pad: 12, radius: 18 },
  medium: { font: 15, button: 34, icon: 18, pad: 16, radius: 24 },
  large: { font: 17, button: 40, icon: 20, pad: 18, radius: 28 },
};

export function Composer({
  onSubmit,
  busy = false,
  onStop,
  placeholder = "Ask anything",
  defaultValue = "",
  value,
  onValueChange,
  models,
  model,
  onModelChange,
  efforts,
  effort,
  onEffortChange,
  attachments = true,
  skills,
  activeSkills,
  onSkillsChange,
  actions,
  accept,
  voice = true,
  lang,
  color: colorProp,
  glow: glowProp,
  layout = "stacked",
  variant = "soft",
  size = "medium",
  radius,
  sendIcon = "arrow",
  maxLength,
  submitOnEnter = true,
  focusRing = true,
  tools,
  maxHeight = 200,
  disabled = false,
  autoFocus = false,
  className,
  style,
}: ComposerProps) {
  const theme = useTheme();
  const color = colorProp ?? theme.accent ?? "#3d7bff";
  const glow = glowProp ?? theme.glow;
  const [own, setOwn] = useState(defaultValue);
  const text = value ?? own;
  const setText = (next: string) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };
  const [files, setFiles] = useState<Attached[]>([]);
  const [chosen, setChosen] = useState(
    models?.find((item) => !item.disabled)?.id,
  );
  // The middle level to start, the way most apps default.
  const [ownEffort, setOwnEffort] = useState(
    efforts?.[Math.floor((efforts.length - 1) / 2)],
  );
  const currentEffort = effort ?? ownEffort;
  const [ownSkills, setOwnSkills] = useState<string[]>([]);
  const picked = activeSkills ?? ownSkills;
  const setPicked = (next: string[]) => {
    if (activeSkills === undefined) setOwnSkills(next);
    onSkillsChange?.(next);
  };
  const toggleSkill = (id: string) =>
    setPicked(
      picked.includes(id)
        ? picked.filter((item) => item !== id)
        : [...picked, id],
    );
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const dark = useDarkText(area);
  const scale = SIZES[size];
  const inline = layout === "inline";
  const hints = Array.isArray(placeholder) ? placeholder : [placeholder];

  const current = model ?? chosen;
  const listen = useVoice({
    lang,
    onText: (heard) => setText(maxLength ? heard.slice(0, maxLength) : heard),
  });
  const canListen = voice && listen.supported;
  const ready = !disabled && (text.trim().length > 0 || files.length > 0);
  const empty = !text && !listen.interim;

  // Grows with the text, up to maxHeight.
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(maxHeight, element.scrollHeight)}px`;
    element.style.overflowY =
      element.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [text, listen.interim, maxHeight, size, layout]);

  // Several hints take turns while the box is empty.
  useEffect(() => {
    if (hints.length < 2 || !empty || listen.active) return;
    const timer = setInterval(
      () => setHint((now) => (now + 1) % hints.length),
      3200,
    );
    return () => clearInterval(timer);
  }, [hints.length, empty, listen.active]);

  // Previews are object URLs, handed back when the Composer goes.
  const latest = useRef(files);
  useEffect(() => {
    latest.current = files;
  });
  useEffect(
    () => () =>
      latest.current.forEach(
        (item) => item.url && URL.revokeObjectURL(item.url),
      ),
    [],
  );

  function add(list: FileList | File[]) {
    const next = Array.from(list).map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      url: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined,
    }));
    if (next.length) setFiles((now) => [...now, ...next]);
  }

  function remove(id: string) {
    setFiles((now) => {
      const gone = now.find((item) => item.id === id);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return now.filter((item) => item.id !== id);
    });
  }

  function submit() {
    if (busy || !ready) return;
    if (listen.active) listen.stop();
    onSubmit?.({
      text: text.trim(),
      files: files.map((item) => item.file),
      model: current,
      skills: picked,
      effort:
        models?.find((item) => item.id === current)?.effort === false
          ? undefined
          : currentEffort,
    });
    files.forEach((item) => item.url && URL.revokeObjectURL(item.url));
    setFiles([]);
    setText("");
    area.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      submitOnEnter &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  }

  function onPaste(event: ClipboardEvent) {
    if (!attachments || !event.clipboardData.files.length) return;
    event.preventDefault();
    add(event.clipboardData.files);
  }

  function onDrop(event: DragEvent) {
    if (!attachments) return;
    event.preventDefault();
    setDragging(false);
    add(event.dataTransfer.files);
  }

  const edge = `color-mix(in oklab, currentColor ${variant === "outline" ? 22 : 12}%, transparent)`;
  const line = "color-mix(in oklab, currentColor 12%, transparent)";
  const faint = "color-mix(in oklab, currentColor 50%, transparent)";
  const ring = focusRing && focused && !listen.active;
  // Aura takes four colours. Fewer are repeated round the edge.
  const lights = glow?.length ? glow : AURA_PALETTES.aurora;
  const palette = [0, 1, 2, 3].map(
    (i) => lights[i % lights.length],
  ) as AuraColors;
  const corner = radius ?? rounded(scale.radius, theme);
  const left = maxLength ? maxLength - text.length : Infinity;
  // On one line, the text sits level with the buttons.
  const lineHeight = scale.font * 1.5;
  const textPad = inline
    ? `${Math.max(4, (scale.button - lineHeight) / 2)}px 6px`
    : `${scale.pad - 2}px ${scale.pad}px 6px`;

  const chosenSkills = (skills ?? []).filter((item) =>
    picked.includes(item.id),
  );
  const hasMenu = Boolean(skills?.length || actions?.length);

  const leading = (
    <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
      {hasMenu ? (
        <AddMenu
          upload={attachments ? () => picker.current?.click() : undefined}
          skills={skills ?? []}
          picked={picked}
          onSkill={toggleSkill}
          actions={actions ?? []}
          dark={dark}
          disabled={disabled}
          scale={scale}
        />
      ) : (
        attachments && (
          <IconButton
            label="Add files"
            onClick={() => picker.current?.click()}
            disabled={disabled}
            scale={scale}
          >
            <path d="M12 5v14M5 12h14" />
          </IconButton>
        )
      )}
      {attachments && (
        <>
          <input
            ref={picker}
            type="file"
            multiple
            accept={accept}
            hidden
            onChange={(event) => {
              if (event.target.files) add(event.target.files);
              event.target.value = "";
            }}
          />
        </>
      )}
      {models && models.length > 0 && (
        <ModelMenu
          models={models}
          value={current}
          dark={dark}
          disabled={disabled}
          height={scale.button}
          color={color}
          efforts={efforts ?? []}
          effort={currentEffort}
          onEffort={(next) => {
            setOwnEffort(next);
            onEffortChange?.(next);
          }}
          onChange={(id) => {
            setChosen(id);
            onModelChange?.(id);
          }}
        />
      )}
      {/* Picked skills, each a pill that takes itself off */}
      <AnimatePresence initial={false} mode="popLayout">
        {chosenSkills.map((item) => (
          <motion.button
            key={item.id}
            layout
            type="button"
            aria-label={`Remove ${item.name}`}
            title={`Remove ${item.name}`}
            onClick={() => toggleSkill(item.id)}
            initial={{ opacity: 0, scale: 0.8, filter: "blur(2px)" }}
            animate={{
              opacity: 1,
              scale: 1,
              filter: "blur(0px)",
              transition: { duration: 0.35, ease: [0.34, 1.36, 0.64, 1] },
            }}
            exit={{
              opacity: 0,
              scale: 0.9,
              filter: "blur(2px)",
              transition: { duration: 0.15, ease: EASE },
            }}
            transition={{ duration: 0.25, ease: EASE }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: scale.button - 6,
              margin: "0 2px",
              padding: "0 8px 0 9px",
              border: 0,
              borderRadius: 9999,
              background: `color-mix(in oklab, ${color} 14%, transparent)`,
              color,
              font: "inherit",
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: "nowrap",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <span style={{ display: "flex", width: 14, height: 14 }}>
              {item.icon ?? <SkillGlyph />}
            </span>
            {item.name}
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M2 2l6 6M8 2 2 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );

  const trailing = (
    <>
      <AnimatePresence>
        {left <= Math.max(10, (maxLength ?? 0) * 0.2) && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{
              padding: "0 6px",
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
              color: left <= 0 ? "#ef4444" : faint,
            }}
          >
            {left}
          </motion.span>
        )}
      </AnimatePresence>
      {tools}
      {canListen && (
        <IconButton
          label={listen.active ? "Stop listening" : "Speak"}
          onClick={() => (listen.active ? listen.stop() : listen.start(text))}
          active={listen.active}
          color={color}
          disabled={disabled || busy}
          scale={scale}
        >
          {listen.active ? (
            <path d="M5 12.5 10 17.5 19 7" />
          ) : (
            <>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            </>
          )}
        </IconButton>
      )}
      <Send
        busy={busy}
        ready={ready}
        color={color}
        icon={sendIcon}
        scale={scale}
        onSend={submit}
        onStop={() => onStop?.()}
      />
    </>
  );

  const field = (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <textarea
        ref={area}
        rows={1}
        value={
          listen.interim
            ? `${text}${text && !text.endsWith(" ") ? " " : ""}${listen.interim}`
            : text
        }
        onChange={(event) => {
          if (!listen.active) setText(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxLength={maxLength}
        disabled={disabled}
        readOnly={listen.active}
        autoFocus={autoFocus}
        aria-label={hints[0]}
        style={{
          display: "block",
          boxSizing: "border-box",
          width: "100%",
          resize: "none",
          border: 0,
          outline: "none",
          background: "transparent",
          color: "inherit",
          font: "inherit",
          fontSize: scale.font,
          lineHeight: 1.5,
          padding: textPad,
          margin: 0,
        }}
      />
      {/* The hint, drawn by hand so several can take turns */}
      {empty && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            padding: textPad,
            fontSize: scale.font,
            lineHeight: 1.5,
            color: faint,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={listen.active ? "listening" : hint % hints.length}
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.35, ease: EASE }}
              style={{
                display: "block",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {listen.active ? "Listening" : hints[hint % hints.length]}
            </motion.span>
          </AnimatePresence>
        </span>
      )}
    </div>
  );

  return (
    <div
      className={className}
      style={{
        position: "relative",
        isolation: "isolate",
        boxSizing: "border-box",
        width: "100%",
        borderRadius: corner,
        background:
          variant === "solid"
            ? dark
              ? "#1a1a1a"
              : "#ffffff"
            : variant === "outline"
              ? "transparent"
              : `color-mix(in oklab, currentColor ${variant === "glass" ? 7 : 4}%, transparent)`,
        backdropFilter:
          variant === "glass" ? "blur(18px) saturate(1.5)" : undefined,
        WebkitBackdropFilter:
          variant === "glass" ? "blur(18px) saturate(1.5)" : undefined,
        boxShadow: [
          `inset 0 0 0 1px ${ring ? `color-mix(in oklab, ${color} 55%, transparent)` : edge}`,
          ring
            ? `0 0 0 4px color-mix(in oklab, ${color} 14%, transparent)`
            : "",
          variant === "solid"
            ? `0 16px 40px -18px rgba(0,0,0,${dark ? 0.8 : 0.3})`
            : "",
          variant === "glass" ? "0 10px 30px -12px rgba(0,0,0,0.25)" : "",
        ]
          .filter(Boolean)
          .join(", "),
        transition: "box-shadow 200ms ease, border-radius 300ms ease",
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
      onDragOver={(event) => {
        if (!attachments || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={onDrop}
    >
      {/* While it listens, Aura glows round the inside edge with the voice */}
      <AnimatePresence>
        {listen.active && (
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              borderRadius: "inherit",
              pointerEvents: "none",
            }}
          >
            <Aura
              level={listen.level}
              palette={palette}
              intensity={0.85}
              style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Files waiting to go */}
      <AnimatePresence initial={false}>
        {files.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                padding: "12px 12px 0",
              }}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {files.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
                  >
                    <Chip
                      item={item}
                      onRemove={() => remove(item.id)}
                      line={line}
                      faint={faint}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {inline ? (
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 2,
            padding: 6,
          }}
        >
          {/* The buttons sit on the last line as the text grows, centred on send */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: scale.button,
              flexShrink: 0,
            }}
          >
            {leading}
          </div>
          {field}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              height: scale.button,
              flexShrink: 0,
            }}
          >
            {trailing}
          </div>
        </div>
      ) : (
        <>
          {field}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: `6px ${scale.pad / 2}px ${scale.pad / 2}px`,
            }}
          >
            {leading}
            <div style={{ flex: 1 }} />
            {trailing}
          </div>
        </>
      )}

      {/* A file held over it */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              inset: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: Math.max(0, corner - 4),
              border: `1.5px dashed ${color}`,
              background: `color-mix(in oklab, ${color} 10%, ${dark ? "#111" : "#fff"})`,
              color: color,
              fontSize: 14,
              fontWeight: 500,
              pointerEvents: "none",
            }}
          >
            Drop to add
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function IconButton({
  label,
  onClick,
  disabled,
  active,
  color,
  scale,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  color?: string;
  scale: Scale;
  children: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.9 }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: scale.button,
        height: scale.button,
        padding: 0,
        border: 0,
        borderRadius: 9999,
        background: active
          ? `color-mix(in oklab, ${color} 16%, transparent)`
          : "transparent",
        color: active ? color : "inherit",
        opacity: disabled ? 0.4 : active ? 1 : 0.7,
        cursor: disabled ? "default" : "pointer",
        transition:
          "background 200ms ease, color 200ms ease, opacity 200ms ease",
      }}
    >
      <svg
        width={scale.icon}
        height={scale.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </motion.button>
  );
}

/** Send, or stop while it answers. */
function Send({
  busy,
  ready,
  color,
  icon,
  scale,
  onSend,
  onStop,
}: {
  busy: boolean;
  ready: boolean;
  color: string;
  icon: NonNullable<ComposerProps["sendIcon"]>;
  scale: Scale;
  onSend: () => void;
  onStop: () => void;
}) {
  const live = busy || ready;
  const ring = scale.button + 8;
  return (
    <motion.button
      type="button"
      aria-label={busy ? "Stop" : "Send"}
      onClick={busy ? onStop : onSend}
      disabled={!live}
      whileTap={live ? { scale: 0.9 } : undefined}
      animate={{ scale: live ? 1 : 0.94 }}
      transition={{ type: "spring", duration: 0.35, bounce: 0.35 }}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: scale.button,
        height: scale.button,
        marginLeft: 4,
        padding: 0,
        border: 0,
        borderRadius: 9999,
        background: live
          ? color
          : "color-mix(in oklab, currentColor 10%, transparent)",
        color: live
          ? contrast(color)
          : "color-mix(in oklab, currentColor 40%, transparent)",
        cursor: live ? "pointer" : "default",
        transition: "background 200ms ease, color 200ms ease",
      }}
    >
      {/* A slow arc round stop, so it reads as working */}
      <AnimatePresence>
        {busy && (
          <motion.svg
            key="arc"
            viewBox="0 0 40 40"
            aria-hidden="true"
            initial={{ opacity: 0, rotate: 0 }}
            animate={{ opacity: 1, rotate: 360 }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 0.2 },
              rotate: { duration: 1.1, repeat: Infinity, ease: "linear" },
            }}
            style={{
              position: "absolute",
              top: -4,
              left: -4,
              width: ring,
              height: ring,
            }}
          >
            <circle
              cx="20"
              cy="20"
              r="18.5"
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="28 90"
            />
          </motion.svg>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        <motion.svg
          key={busy ? "stop" : icon}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            marginTop: -scale.icon / 2,
            marginLeft: -scale.icon / 2,
          }}
          width={scale.icon}
          height={scale.icon}
          viewBox="0 0 24 24"
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0.4, rotate: busy ? -90 : 90 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.4 }}
          transition={{ type: "spring", duration: 0.4, bounce: 0.3 }}
        >
          {busy ? (
            <rect
              x="7"
              y="7"
              width="10"
              height="10"
              rx="2.5"
              fill="currentColor"
            />
          ) : icon === "sparkle" ? (
            <path
              d="M12 3.5c.6 4.3 2.6 6.4 7 7-4.4.6-6.4 2.7-7 7-.6-4.3-2.6-6.4-7-7 4.4-.6 6.4-2.7 7-7Z"
              fill="currentColor"
            />
          ) : icon === "plane" ? (
            <path
              d="M20 4 4 10.5l6.5 2.5L13 19.5 20 4ZM10.5 13 14 9.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d="M12 19V5M6 11l6-6 6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </motion.svg>
      </AnimatePresence>
    </motion.button>
  );
}

function Chip({
  item,
  onRemove,
  line,
  faint,
}: {
  item: Attached;
  onRemove: () => void;
  line: string;
  faint: string;
}) {
  const remove = (
    <button
      type="button"
      aria-label={`Remove ${item.file.name}`}
      onClick={onRemove}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
        padding: 0,
        border: 0,
        borderRadius: 9999,
        background: "rgba(0,0,0,0.65)",
        color: "#fff",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path
          d="M2 2l6 6M8 2 2 8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );

  if (item.url) {
    return (
      <div style={{ position: "relative", width: 52, height: 52 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt={item.file.name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: 12,
            boxShadow: `0 0 0 1px ${line}`,
          }}
        />
        <span style={{ position: "absolute", top: -6, right: -6 }}>
          {remove}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: 52,
        maxWidth: 220,
        boxSizing: "border-box",
        padding: "0 8px 0 10px",
        borderRadius: 12,
        boxShadow: `inset 0 0 0 1px ${line}`,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "color-mix(in oklab, currentColor 8%, transparent)",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: 0.3,
          flexShrink: 0,
        }}
      >
        {(item.file.name.split(".").pop() ?? "file").slice(0, 4).toUpperCase()}
      </span>
      <span style={{ minWidth: 0, fontSize: 13, lineHeight: 1.25 }}>
        <span
          style={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.file.name}
        </span>
        <span style={{ display: "block", color: faint }}>
          {size(item.file.size)}
        </span>
      </span>
      {remove}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Menus. The model picker and the plus menu share one surface, close on a   */
/* click away or Escape, and follow the arrow keys. They open from their     */
/* trigger in 250ms and close faster than they open, in 150ms.               */
/* ------------------------------------------------------------------------ */

type MenuKeys = {
  open: boolean;
  close: () => void;
  box: RefObject<HTMLDivElement | null>;
  count: number;
  active: number;
  setActive: (index: number) => void;
  /** Whether a row can be landed on. */
  can?: (index: number) => boolean;
  onPick: (index: number) => void;
  onBack?: () => void;
  /** Left and right, for a setting that sits in the menu. */
  onSide?: (step: -1 | 1) => void;
};

function useMenu(keys: MenuKeys) {
  const latest = useRef(keys);
  useEffect(() => {
    latest.current = keys;
  });
  const { open } = keys;

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!latest.current.box.current?.contains(event.target as Node))
        latest.current.close();
    };
    const press = (event: globalThis.KeyboardEvent) => {
      const { count, active, setActive, can, onPick, onBack, onSide, close } =
        latest.current;
      const step = (by: number) => {
        let next = active;
        for (let i = 0; i < count; i++) {
          next = (next + by + count) % count;
          if (!can || can(next)) return setActive(next);
        }
      };
      if (event.key === "Escape") close();
      else if (event.key === "ArrowDown") step(1);
      else if (event.key === "ArrowUp") step(active < 0 ? 0 : -1);
      else if (event.key === "Enter" && active >= 0) onPick(active);
      else if (event.key === "ArrowLeft" && onBack) onBack();
      else if (event.key === "ArrowLeft" && onSide) onSide(-1);
      else if (event.key === "ArrowRight" && onSide) onSide(1);
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", press, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", press, true);
    };
  }, [open]);
}

function menuSurface(dark: boolean, radius = 18): CSSProperties {
  return {
    position: "absolute",
    bottom: "calc(100% + 8px)",
    left: 0,
    zIndex: 40,
    padding: 5,
    borderRadius: radius,
    background: dark ? "#1b1b1b" : "#ffffff",
    color: dark ? "#f5f5f5" : "#0a0a0a",
    transformOrigin: "bottom left",
    overflow: "hidden",
    boxShadow: `0 0 0 1px ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"}, 0 22px 50px -18px rgba(0,0,0,${dark ? 0.75 : 0.28})`,
  };
}

// A dropdown grows from its trigger, from 97%, and shrinks only to 99% on the
// way out, so the close reads as quieter than the open.
const MENU_MOTION = {
  initial: { opacity: 0, scale: 0.97 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.25, ease: EASE },
  },
  exit: { opacity: 0, scale: 0.99, transition: { duration: 0.15, ease: EASE } },
} as const;

// The highlight slides between rows the way a tab slides between tabs.
const SLIDE = { duration: 0.25, ease: EASE } as const;

/** One row of a menu. A soft highlight glides from row to row behind it. */
function MenuRow({
  glide,
  active,
  disabled,
  selected,
  role = "menuitem",
  compact = false,
  onHover,
  onPick,
  children,
}: {
  glide: string;
  active: boolean;
  disabled?: boolean;
  selected?: boolean;
  role?: "menuitem" | "option";
  compact?: boolean;
  onHover: () => void;
  onPick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-selected={role === "option" ? selected : undefined}
      aria-disabled={disabled || undefined}
      onPointerMove={disabled ? undefined : onHover}
      onClick={disabled ? undefined : onPick}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        width: "100%",
        minHeight: compact ? 32 : 40,
        padding: compact ? "5px 9px" : "8px 11px",
        border: 0,
        borderRadius: compact ? 10 : 13,
        background: "transparent",
        color: "inherit",
        font: "inherit",
        textAlign: "left",
        whiteSpace: "nowrap",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {active && (
        <motion.span
          layoutId={glide}
          aria-hidden="true"
          transition={SLIDE}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            background: "color-mix(in oklab, currentColor 8%, transparent)",
          }}
        />
      )}
      <span
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: compact ? 9 : 12,
          flex: 1,
          minWidth: 0,
        }}
      >
        {children}
      </span>
    </button>
  );
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, opacity: 0.85 }}
    >
      {children}
    </svg>
  );
}

/** The mark for a skill without its own icon. A small four pointed spark. */
function SkillGlyph() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5c.7 5 2.5 6.8 7.5 7.5-5 .7-6.8 2.5-7.5 7.5-.7-5-2.5-6.8-7.5-7.5 5-.7 6.8-2.5 7.5-7.5Z"
        fill="currentColor"
      />
      <path
        d="M19 15.5c.3 2 1 2.7 3 3-2 .3-2.7 1-3 3-.3-2-1-2.7-3-3 2-.3 2.7-1 3-3Z"
        fill="currentColor"
        opacity="0.6"
      />
    </svg>
  );
}

function Label({ name, note }: { name: string; note?: string }) {
  return (
    <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <span style={{ fontSize: 14.5, fontWeight: 500 }}>{name}</span>
      {note && <span style={{ fontSize: 14, opacity: 0.5 }}>{note}</span>}
    </span>
  );
}

const Chevron = ({ back }: { back?: boolean }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    aria-hidden="true"
    style={{ flexShrink: 0, opacity: 0.45, marginLeft: back ? 0 : "auto" }}
  >
    <path
      d={back ? "M15 5 8 12l7 7" : "M9 5l7 7-7 7"}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Check = ({ color, size = 16 }: { color?: string; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    style={{ flexShrink: 0, marginLeft: "auto", color }}
  >
    <path
      d="M5 12.5 10 17.5 19 7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** The plus. Files, skills and your own actions, in one small menu. */
function AddMenu({
  upload,
  skills,
  picked,
  onSkill,
  actions,
  dark,
  disabled,
  scale,
}: {
  upload?: () => void;
  skills: ComposerSkill[];
  picked: string[];
  onSkill: (id: string) => void;
  actions: ComposerAction[];
  dark: boolean;
  disabled: boolean;
  scale: Scale;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "skills">("main");
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const glide = useId();

  const close = () => setOpen(false);
  const toggle = () => {
    setView("main");
    setActive(-1);
    setOpen((now) => !now);
  };
  const showSkills = () => {
    setView("skills");
    setActive(-1);
  };
  const back = () => {
    setView("main");
    setActive(upload ? 1 : 0);
  };

  type Item = { key: string; run: () => void; row: ReactNode };
  const main: Item[] = [];
  if (upload)
    main.push({
      key: "upload",
      run: () => {
        close();
        upload();
      },
      row: (
        <>
          <Glyph>
            <path d="M15.5 7.5 8.6 14.4a2 2 0 0 0 2.8 2.8l7-7a4 4 0 0 0-5.6-5.6l-7 7a6 6 0 0 0 8.5 8.5l6.2-6.2" />
          </Glyph>
          <Label name="Add photos and files" note="From your computer" />
        </>
      ),
    });
  if (skills.length)
    main.push({
      key: "skills",
      run: showSkills,
      row: (
        <>
          <span
            style={{ display: "flex", width: 19, height: 19, opacity: 0.85 }}
          >
            <SkillGlyph />
          </span>
          <Label
            name="Skills"
            note={picked.length ? `${picked.length} on` : "Ways of working"}
          />
          <Chevron />
        </>
      ),
    });
  for (const action of actions)
    main.push({
      key: action.id,
      run: () => {
        close();
        action.onSelect();
      },
      row: (
        <>
          {action.icon ? (
            <span style={{ display: "flex", width: 19, height: 19 }}>
              {action.icon}
            </span>
          ) : (
            <Glyph>
              <path d="M12 5v14M5 12h14" />
            </Glyph>
          )}
          <Label name={action.label} note={action.note} />
        </>
      ),
    });

  const list: Item[] =
    view === "main"
      ? main
      : [
          {
            key: "back",
            run: back,
            row: (
              <>
                <Chevron back />
                <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.55 }}>
                  Skills
                </span>
              </>
            ),
          },
          ...skills.map((skill) => ({
            key: skill.id,
            run: () => {
              onSkill(skill.id);
              close();
            },
            row: (
              <>
                <span
                  style={{
                    display: "flex",
                    width: 19,
                    height: 19,
                    flexShrink: 0,
                    opacity: 0.85,
                  }}
                >
                  {skill.icon ?? <SkillGlyph />}
                </span>
                <Label name={skill.name} note={skill.note} />
                {picked.includes(skill.id) && <Check />}
              </>
            ),
          })),
        ];

  useMenu({
    open,
    close,
    box,
    count: list.length,
    active,
    setActive,
    onPick: (index) => list[index]?.run(),
    onBack: view === "skills" ? back : undefined,
  });

  return (
    <div ref={box} style={{ position: "relative" }}>
      <motion.button
        type="button"
        aria-label="Add"
        title="Add"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        disabled={disabled}
        whileTap={{ scale: 0.92 }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          width: scale.button,
          height: scale.button,
          padding: 0,
          border: 0,
          borderRadius: 9999,
          background: open
            ? "color-mix(in oklab, currentColor 9%, transparent)"
            : "transparent",
          color: "inherit",
          opacity: disabled ? 0.4 : open ? 1 : 0.7,
          cursor: disabled ? "default" : "pointer",
          transition: "background 150ms ease-out, opacity 150ms ease-out",
        }}
      >
        {/* The plus turns into a cross, with a small overshoot on the way in */}
        <motion.svg
          width={scale.icon + 2}
          height={scale.icon + 2}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
          animate={{ rotate: open ? 45 : 0 }}
          transition={
            open
              ? { duration: 0.35, ease: [0.34, 1.25, 0.64, 1] }
              : { duration: 0.25, ease: EASE }
          }
        >
          <path d="M12 5v14M5 12h14" />
        </motion.svg>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Add"
            {...MENU_MOTION}
            style={{ ...menuSurface(dark, 20), minWidth: 300 }}
          >
            {/* Each view slides in from its own side, and the menu takes its height */}
            <motion.div layout transition={SLIDE}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={view}
                  initial={{
                    opacity: 0,
                    x: view === "skills" ? 8 : -8,
                    filter: "blur(3px)",
                  }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  exit={{
                    opacity: 0,
                    x: view === "skills" ? -8 : 8,
                    filter: "blur(3px)",
                  }}
                  transition={SLIDE}
                >
                  {list.map((item, index) => (
                    <MenuRow
                      key={item.key}
                      glide={glide}
                      active={index === active}
                      onHover={() => setActive(index)}
                      onPick={item.run}
                    >
                      {item.row}
                    </MenuRow>
                  ))}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** How hard the model thinks, as a few small bars. */
function EffortBars({ level, of }: { level: number; of: number }) {
  return (
    <svg
      width={of * 3.5 - 1}
      height="10"
      viewBox={`0 0 ${of * 3.5 - 1} 10`}
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {Array.from({ length: of }, (_, i) => {
        const tall = 4 + (6 * (i + 1)) / of;
        return (
          <rect
            key={i}
            x={i * 3.5}
            y={10 - tall}
            width="2.5"
            height={tall}
            rx="1.25"
            fill="currentColor"
            style={{
              opacity: i <= level ? 0.9 : 0.25,
              transition: "opacity 250ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        );
      })}
    </svg>
  );
}

function ModelMenu({
  models,
  value,
  efforts,
  effort,
  onEffort,
  dark,
  disabled,
  height,
  color,
  onChange,
}: {
  models: ComposerModel[];
  value?: string;
  efforts: string[];
  effort?: string;
  onEffort: (effort: string) => void;
  dark: boolean;
  disabled: boolean;
  height: number;
  color: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = models.find((item) => item.id === value) ?? models[0];
  const thinks = efforts.length > 0 && current.effort !== false;
  const level = effort ? efforts.indexOf(effort) : -1;

  const pick = (index: number) => {
    const item = models[index];
    if (!item || item.disabled) return;
    onChange(item.id);
    setOpen(false);
  };
  const nudge = (step: -1 | 1) => {
    if (!thinks) return;
    const next = Math.min(efforts.length - 1, Math.max(0, level + step));
    onEffort(efforts[next]);
  };

  useMenu({
    open,
    close: () => setOpen(false),
    box,
    count: models.length,
    active,
    setActive,
    can: (index) => !models[index]?.disabled,
    onPick: pick,
    onSide: nudge,
  });

  return (
    <div ref={box} style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={() => {
          setActive(models.indexOf(current));
          setOpen((now) => !now);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          height,
          padding: "0 8px",
          border: 0,
          borderRadius: 9999,
          background: open
            ? "color-mix(in oklab, currentColor 8%, transparent)"
            : "transparent",
          color: "inherit",
          font: "inherit",
          fontSize: 13,
          fontWeight: 500,
          opacity: open ? 1 : 0.75,
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "background 150ms ease-out, opacity 150ms ease-out",
        }}
      >
        {(current.icon || current.provider) && (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={current.id}
              initial={{ opacity: 0, scale: 0.25, filter: "blur(2px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.25, filter: "blur(2px)" }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              style={{ display: "flex", width: 14, height: 14 }}
            >
              {current.icon ?? <ProviderMark provider={current.provider!} />}
            </motion.span>
          </AnimatePresence>
        )}
        {current.name}
        {thinks && level >= 0 && (
          <span
            title={`${effort} effort`}
            style={{ display: "flex", marginLeft: 1, opacity: 0.55 }}
          >
            <EffortBars level={level} of={efforts.length} />
          </span>
        )}
        <motion.svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          aria-hidden="true"
          animate={{ scaleY: open ? -1 : 1 }}
          transition={{ duration: 0.25, ease: EASE }}
          style={{ opacity: 0.5 }}
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </motion.svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            role="listbox"
            aria-label="Model"
            {...MENU_MOTION}
            style={{
              ...menuSurface(dark, 14),
              minWidth: 210,
              maxHeight: 360,
              overflowY: "auto",
            }}
          >
            {models.map((item, index) => {
              const on = item.id === current.id;
              const heading =
                item.group && item.group !== models[index - 1]?.group;
              return (
                <div key={item.id}>
                  {heading && (
                    <div
                      style={{
                        padding: index ? "9px 9px 3px" : "4px 9px 3px",
                        fontSize: 11.5,
                        fontWeight: 500,
                        opacity: 0.4,
                      }}
                    >
                      {item.group}
                    </div>
                  )}
                  <MenuRow
                    glide={`${id}-glide`}
                    role="option"
                    compact
                    selected={on}
                    active={index === active}
                    disabled={item.disabled}
                    onHover={() => setActive(index)}
                    onPick={() => pick(index)}
                  >
                    <span
                      style={{
                        display: "flex",
                        width: 15,
                        height: 15,
                        flexShrink: 0,
                      }}
                    >
                      {item.icon ??
                        (item.provider ? (
                          <ProviderMark provider={item.provider} />
                        ) : (
                          <SkillGlyph />
                        ))}
                    </span>
                    <span
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 7,
                        minWidth: 0,
                      }}
                    >
                      <span style={{ fontSize: 13.5, fontWeight: 500 }}>
                        {item.name}
                      </span>
                      {item.tag && (
                        <span style={{ fontSize: 11.5, opacity: 0.45 }}>
                          {item.tag}
                        </span>
                      )}
                      {item.note && (
                        <span
                          style={{
                            fontSize: 12.5,
                            opacity: 0.45,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.note}
                        </span>
                      )}
                    </span>
                    {on && <Check color={color} size={14} />}
                  </MenuRow>
                </div>
              );
            })}

            {/* Effort, for models that think */}
            {thinks && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  margin: "5px -5px -5px",
                  padding: "7px 9px 8px 14px",
                  borderTop:
                    "1px solid color-mix(in oklab, currentColor 8%, transparent)",
                }}
              >
                <span style={{ fontSize: 12, opacity: 0.45 }}>Effort</span>
                <div
                  role="radiogroup"
                  aria-label="Effort"
                  style={{ display: "flex", marginLeft: "auto", gap: 2 }}
                >
                  {efforts.map((name) => {
                    const on = name === effort;
                    return (
                      <button
                        key={name}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onEffort(name)}
                        style={{
                          position: "relative",
                          height: 24,
                          padding: "0 8px",
                          border: 0,
                          borderRadius: 7,
                          background: "transparent",
                          color: "inherit",
                          font: "inherit",
                          fontSize: 12,
                          fontWeight: 500,
                          opacity: on ? 1 : 0.5,
                          cursor: "pointer",
                          transition: "opacity 250ms ease-out",
                        }}
                      >
                        {on && (
                          <motion.span
                            layoutId={`${id}-effort`}
                            aria-hidden="true"
                            transition={SLIDE}
                            style={{
                              position: "absolute",
                              inset: 0,
                              borderRadius: "inherit",
                              background:
                                "color-mix(in oklab, currentColor 9%, transparent)",
                            }}
                          />
                        )}
                        <span style={{ position: "relative" }}>{name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Provider marks, from Simple Icons (CC0). Each in its own colour, OpenAI's  */
/* in the colour of the text.                                                */
/* ------------------------------------------------------------------------ */

const MARKS: Record<ComposerProvider, { d: string; fill: string }> = {
  anthropic: {
    fill: "#d97757",
    d: "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z",
  },
  openai: {
    fill: "currentColor",
    d: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z",
  },
  google: {
    fill: "gemini",
    d: "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81",
  },
  meta: {
    fill: "#0866ff",
    d: "M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z",
  },
  mistral: {
    fill: "#fa520f",
    d: "M17.143 3.429v3.428h-3.429v3.429h-3.428V6.857H6.857V3.43H3.43v13.714H0v3.428h10.286v-3.428H6.857v-3.429h3.429v3.429h3.429v-3.429h3.428v3.429h-3.428v3.428H24v-3.428h-3.43V3.429z",
  },
  deepseek: {
    fill: "#4d6bfe",
    d: "M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45",
  },
};

/** A provider's mark, filling its box. */
export function ProviderMark({ provider }: { provider: ComposerProvider }) {
  const gradient = `gemini-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const mark = MARKS[provider];
  if (!mark) return null;
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" aria-hidden="true">
      {mark.fill === "gemini" && (
        <defs>
          <linearGradient id={gradient} x1="0" y1="24" x2="24" y2="0">
            <stop offset="0" stopColor="#4285f4" />
            <stop offset="0.55" stopColor="#9b72cb" />
            <stop offset="1" stopColor="#d96570" />
          </linearGradient>
        </defs>
      )}
      <path
        d={mark.d}
        fill={mark.fill === "gemini" ? `url(#${gradient})` : mark.fill}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------------ */
/* Voice. The browser's own speech recognition for the words, and the        */
/* microphone's loudness for Aura.                                            */
/* ------------------------------------------------------------------------ */

type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type RecognitionClass = new () => Recognition;

function recognitionClass() {
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

function useVoice({
  lang,
  onText,
}: {
  lang?: string;
  onText: (text: string) => void;
}) {
  const supported = useSyncExternalStore(
    noSubscribe,
    () => Boolean(recognitionClass()),
    () => false,
  );
  const [active, setActive] = useState(false);
  const [interim, setInterim] = useState("");
  const session = useRef<{
    recognition: Recognition;
    stream?: MediaStream;
    context?: AudioContext;
    analyser?: AnalyserNode;
    data?: Uint8Array<ArrayBuffer>;
  } | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  const stop = () => {
    const now = session.current;
    session.current = null;
    if (now) {
      now.recognition.onend = null;
      now.recognition.stop();
      now.stream?.getTracks().forEach((track) => track.stop());
      void now.context?.close();
    }
    setActive(false);
    setInterim("");
  };

  const start = (before: string) => {
    const Recognizer = recognitionClass();
    if (!Recognizer || session.current) return;
    const recognition = new Recognizer();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang ?? document.documentElement.lang ?? "en";
    const base = before.trimEnd();
    let finals = "";
    recognition.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finals += result[0].transcript;
        else pending += result[0].transcript;
      }
      onTextRef.current([base, finals.trim()].filter(Boolean).join(" "));
      setInterim(pending.trim());
    };
    recognition.onend = stop;
    recognition.onerror = stop;
    session.current = { recognition };
    setActive(true);
    recognition.start();

    // The waveform only. Words still arrive if the microphone is refused here.
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => {
        if (session.current?.recognition !== recognition) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.7;
        context.createMediaStreamSource(stream).connect(analyser);
        session.current = {
          recognition,
          stream,
          context,
          analyser,
          data: new Uint8Array(analyser.frequencyBinCount),
        };
      })
      .catch(() => {});
  };

  useEffect(
    () => () => {
      const now = session.current;
      if (!now) return;
      now.recognition.onend = null;
      now.recognition.abort();
      now.stream?.getTracks().forEach((track) => track.stop());
      void now.context?.close();
    },
    [],
  );

  // Loudness across the voice range, from 0 to 1. A slow breath until the
  // microphone is ready, or if it is refused.
  const level = useCallback(() => {
    const now = session.current;
    if (!now?.analyser || !now.data) {
      return 0.15 + 0.1 * Math.sin(performance.now() / 600);
    }
    now.analyser.getByteFrequencyData(now.data);
    const voice = now.data.subarray(1, Math.ceil(now.data.length * 0.6));
    const average = voice.reduce((sum, bin) => sum + bin, 0) / voice.length;
    return Math.min(1, (average / 255) * 2.2);
  }, []);

  return {
    supported,
    active,
    interim,
    start,
    stop,
    level,
  };
}

/* ------------------------------------------------------------------------ */

/** True when the text around it is light, so menus get a dark surface. */
function useDarkText(element: RefObject<HTMLElement | null>) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => {
      const node = element.current;
      if (!node) return;
      setDark(isLightColor(getComputedStyle(node).color));
    };
    const frame = requestAnimationFrame(read);
    // Themes usually switch with a class or attribute on the root.
    const watcher = new MutationObserver(() => requestAnimationFrame(read));
    watcher.observe(document.documentElement, { attributes: true });
    return () => {
      cancelAnimationFrame(frame);
      watcher.disconnect();
    };
  }, [element]);
  return dark;
}

/** White on dark colours, near black on light ones. */
function contrast(color: string) {
  const hex = color.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 170 ? "#0a0a0a" : "#ffffff";
}

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
