import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import {
  AccessibilityInfo, Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextProps,
  TextStyle, View, ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, MAX_FONT_SCALE, mono, radius, space, TOUCH } from './theme';
import { monoFace } from './fonts';
import type { SyncStatus } from './useRuntimeController';

// ───────────────────────── Text ─────────────────────────

type Variant = 'display' | 'title' | 'heading' | 'body' | 'caption' | 'label' | 'code' | 'mono' | 'number';
type Tone = 'primary' | 'secondary' | 'muted' | 'accent' | 'success' | 'warning' | 'danger' | 'violet' | 'onAccent';

const variantStyle: Record<Variant, TextStyle> = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontFamily: mono, fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6 },
  code: { fontFamily: mono, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  mono: { fontFamily: mono, fontSize: 13, lineHeight: 18, fontWeight: '400' },
  number: { fontFamily: mono, fontSize: 16, lineHeight: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
};
const toneColor: Record<Tone, string> = {
  primary: colors.text, secondary: colors.textSecondary, muted: colors.textMuted, accent: colors.accent,
  success: colors.success, warning: colors.warning, danger: colors.danger, violet: colors.violet, onAccent: colors.accentText,
};

// Body copy scales fully. Chrome (titles, identifiers, buttons) is capped so layouts survive the largest sizes.
const scaleCap: Record<Variant, number> = {
  display: 1.5, title: 1.5, heading: 1.7, body: MAX_FONT_SCALE, caption: MAX_FONT_SCALE, label: 1.35, code: 1.5, mono: 1.5, number: 1.5,
};

/** Monospace variants use JetBrains Mono once loaded; each weight is a separate face. */
const resolveVariant = (variant: Variant): TextStyle => {
  const base = variantStyle[variant];
  if (base.fontFamily !== mono) return base;
  const face = monoFace((base.fontWeight as '400' | '600' | '700' | '800') ?? '400');
  return face ? { ...base, fontFamily: face, fontWeight: undefined } : base;
};

export const Txt = ({ variant = 'body', tone = 'primary', header, style, ...rest }: TextProps & {
  variant?: Variant; tone?: Tone; header?: boolean;
}) => (
  <Text
    maxFontSizeMultiplier={scaleCap[variant]}
    accessibilityRole={(header ?? (variant === 'display' || variant === 'title')) ? 'header' : undefined}
    style={[resolveVariant(variant), { color: toneColor[tone] }, style]}
    {...rest}
  />
);

// ───────────────────────── Screen chrome ─────────────────────────

/** What every screen header shows on the right, and the save state that rides on it. */
export const ChromeContext = createContext<{ chip: string | null; sync: SyncStatus; onSyncPress: () => void }>({ chip: null, sync: 'synced', onSyncPress: () => undefined });

/** `goal · wk 2/6` with the branch mark. Carries the save state only when it isn't clean. */
const RuntimeChip = () => {
  const { chip, sync, onSyncPress } = useContext(ChromeContext);
  if (!chip) return null;
  const trouble = sync === 'device' || sync === 'failed';
  const spoken = sync === 'device' ? 'Saved on this device only. Tap to retry sync' : sync === 'failed' ? 'Not saved. Tap to retry' : sync === 'saving' ? 'Saving' : 'Synced';
  return (
    <Pressable
      accessibilityRole={trouble ? 'button' : 'text'} accessibilityLabel={`${chip}. ${spoken}`}
      disabled={!trouble} onPress={onSyncPress}
      style={styles.chip}
    >
      <Ionicons name="git-branch" size={14} color={colors.violet} />
      <Txt variant="mono" tone="secondary" numberOfLines={1}>{chip}</Txt>
      {sync === 'saving' ? <Ionicons name="sync" size={13} color={colors.textMuted} /> : null}
      {trouble ? <View style={[styles.syncDot, { backgroundColor: sync === 'failed' ? colors.danger : colors.warning }]} /> : null}
    </Pressable>
  );
};

/** `name.` in bold mono with the orange dot, a muted line beneath, and the runtime chip on the right. */
export const ScreenBrand = ({ name, sub }: { name: string; sub?: string }) => (
  <View style={styles.brandRow}>
    <View style={styles.flex}>
      <Txt variant="label" style={styles.brandName} accessibilityRole="header">{name}<Txt variant="label" style={styles.brandDot}>.</Txt></Txt>
      {sub ? <Txt variant="mono" tone="muted" numberOfLines={2}>{sub}</Txt> : null}
    </View>
    <RuntimeChip />
  </View>
);

/** Bold sans title with its one-line description. */
export const ScreenTitle = ({ title, text }: { title: string; text?: string | null }) => (
  <View style={styles.titleBlock}>
    <Txt style={styles.titleText} accessibilityRole="header">{title}</Txt>
    {text ? <Txt tone="secondary">{text}</Txt> : null}
  </View>
);

// ───────────────────────── Layout ─────────────────────────

export const Card = ({ children, tone, style }: { children: ReactNode; tone?: 'accent' | 'warning' | 'success' | 'danger'; style?: StyleProp<ViewStyle> }) => (
  <View style={[styles.card, tone && { borderColor: tone === 'accent' ? colors.accent : colors[tone] }, style]}>{children}</View>
);

export const Section = ({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) => (
  <View style={styles.section}>
    <View style={styles.sectionHead}>
      <Txt variant="mono" tone="muted" header>@@ {title} @@</Txt>
      {hint}
    </View>
    {children}
  </View>
);

// ───────────────────────── State tags ─────────────────────────

export type RuntimeStateName = 'proposed' | 'active' | 'logged' | 'committed' | 'discarded' | 'recompiled' | 'blocked';
const stateLook: Record<RuntimeStateName, { symbol: string; tone: Tone }> = {
  proposed: { symbol: '○', tone: 'secondary' },
  active: { symbol: '●', tone: 'accent' },
  logged: { symbol: '◐', tone: 'warning' },
  committed: { symbol: '✓', tone: 'success' },
  discarded: { symbol: '✕', tone: 'muted' },
  recompiled: { symbol: '↻', tone: 'accent' },
  blocked: { symbol: '⊘', tone: 'warning' },
};

/** A runtime state, always written out, with a symbol so it never relies on colour. */
export const StateTag = ({ state, label }: { state: RuntimeStateName; label?: string }) => {
  const look = stateLook[state];
  return (
    <View accessible accessibilityLabel={`state: ${label ?? state}`} style={[styles.stateTag, { borderColor: toneColor[look.tone] }]}>
      <Txt variant="label" tone={look.tone}>{look.symbol} {label ?? state}</Txt>
    </View>
  );
};

// ───────────────────────── Buttons ─────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export const Button = ({
  label, onPress, variant = 'primary', disabled, loading, icon, hint, accessibilityLabel, style, grow,
}: {
  label: string; onPress: () => void; variant?: ButtonVariant; disabled?: boolean; loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap; hint?: string; accessibilityLabel?: string; style?: StyleProp<ViewStyle>; grow?: number;
}) => {
  const inactive = Boolean(disabled || loading);
  const textTone: Tone = inactive ? 'muted' : variant === 'primary' ? 'onAccent' : variant === 'danger' ? 'danger' : variant === 'ghost' ? 'accent' : 'primary';
  const text = `${label.toLowerCase()}${loading ? '…' : variant === 'primary' && !inactive && !label.includes('→') ? '  →' : ''}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button, buttonVariant[variant], inactive && styles.buttonInactive,
        pressed && !inactive && styles.pressed, grow !== undefined && { flexGrow: grow, flexBasis: 0 }, style,
      ]}
    >
      {icon && variant !== 'primary' ? <Ionicons name={icon} size={18} color={toneColor[textTone]} /> : null}
      <Txt variant="code" tone={textTone} maxFontSizeMultiplier={1.4} numberOfLines={2} style={styles.buttonLabel}>{text}</Txt>
    </Pressable>
  );
};

const buttonVariant: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  secondary: { backgroundColor: 'transparent', borderColor: colors.borderStrong },
  danger: { backgroundColor: 'transparent', borderColor: colors.danger },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
};

/** Selectable option. Selection shows as a check icon and a heavier border, never colour alone. */
export const Choice = ({
  label, description, selected, onPress, role = 'radio', compact, disabled, hint, code,
}: {
  label: string; description?: string; selected: boolean; onPress: () => void;
  role?: 'radio' | 'checkbox'; compact?: boolean; disabled?: boolean; hint?: string; code?: boolean;
}) => {
  const icon = role === 'checkbox' ? (selected ? 'checkbox' : 'square-outline') : (selected ? 'radio-button-on' : 'radio-button-off');
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityHint={hint}
      accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice, compact ? styles.choiceCompact : styles.choiceFull,
        selected && styles.choiceSelected, disabled && styles.buttonInactive, pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color={selected ? colors.accent : colors.textMuted} />
      <View style={styles.choiceText}>
        <Txt variant={code || compact ? 'code' : 'body'} tone={selected ? 'accent' : 'primary'} style={styles.choiceLabel}>{label}</Txt>
        {description ? <Txt variant="caption" tone="secondary">{description}</Txt> : null}
      </View>
    </Pressable>
  );
};

/** Equal-width single-select strip, for short sets such as 3 / 4 / 5 days. */
export const Segmented = <T extends string | number>({
  options, value, onChange, label, format,
}: {
  options: readonly T[]; value: T; onChange: (value: T) => void; label: string; format?: (value: T) => string;
}) => (
  <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.segmented}>
    {options.map((option) => {
      const selected = option === value;
      return (
        <Pressable
          key={String(option)}
          accessibilityRole="radio"
          accessibilityLabel={`${format ? format(option) : option}`}
          accessibilityState={{ checked: selected }}
          onPress={() => onChange(option)}
          style={({ pressed }) => [styles.segment, selected && styles.segmentSelected, pressed && styles.pressed]}
        >
          {selected ? <Ionicons name="checkmark" size={16} color={colors.accent} /> : null}
          <Txt variant="code" tone={selected ? 'accent' : 'secondary'} style={styles.segmentText}>{format ? format(option) : String(option)}</Txt>
        </Pressable>
      );
    })}
  </View>
);

/** Compact value chip that opens a picker. Quiet by default; warning border when it holds a non-default value. */
export const Pill = ({ label, icon, onPress, highlight, hint, accessibilityLabel }: {
  label?: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; highlight?: boolean; hint?: string; accessibilityLabel?: string;
}) => (
  <Pressable
    accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={hint} onPress={onPress}
    style={({ pressed }) => [styles.pill, highlight && styles.pillHighlight, pressed && styles.pressed]}
  >
    {icon ? <Ionicons name={icon} size={18} color={highlight ? colors.warning : colors.text} /> : null}
    {label ? <Txt variant="code" tone={highlight ? 'warning' : 'primary'} numberOfLines={1}>{label}</Txt> : null}
    {!icon ? <Ionicons name="chevron-down" size={14} color={colors.textMuted} /> : null}
  </Pressable>
);

/** Square icon-only button for secondary menus. */
export const IconButton = ({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) => (
  <Pressable
    accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.iconBox, pressed && styles.pressed]}
  >
    <Ionicons name={icon} size={22} color={colors.text} />
  </Pressable>
);

export const Divider = () => <View style={styles.divider} />;

// ───────────────────────── Feedback ─────────────────────────

export type BannerTone = 'info' | 'success' | 'warning' | 'error';
const bannerTone: Record<BannerTone, { icon: keyof typeof Ionicons.glyphMap; border: string; bg: string; text: Tone }> = {
  info: { icon: 'information-circle', border: colors.accent, bg: colors.accentSoft, text: 'accent' },
  success: { icon: 'checkmark-circle', border: colors.success, bg: colors.successSoft, text: 'success' },
  warning: { icon: 'warning', border: colors.warning, bg: colors.warningSoft, text: 'warning' },
  error: { icon: 'alert-circle', border: colors.danger, bg: colors.dangerSoft, text: 'danger' },
};

export const Banner = ({
  tone, title, message, action, secondaryAction, onDismiss, announce = true,
}: {
  tone: BannerTone; title: string; message?: string;
  action?: { label: string; onPress: () => void };
  secondaryAction?: { label: string; onPress: () => void };
  onDismiss?: () => void; announce?: boolean;
}) => {
  const look = bannerTone[tone];
  useEffect(() => {
    if (announce) AccessibilityInfo.announceForAccessibility(message ? `${title}. ${message}` : title);
  }, [announce, message, title]);
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.banner, { borderColor: look.border, backgroundColor: look.bg }]}
    >
      <View style={styles.bannerHead}>
        <Ionicons name={look.icon} size={22} color={look.border} />
        <View style={styles.bannerBody}>
          <Txt variant="heading" tone={look.text}>{title}</Txt>
          {message ? <Txt variant="caption" tone="secondary">{message}</Txt> : null}
        </View>
        {onDismiss ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss message" onPress={onDismiss} hitSlop={8} style={styles.iconButton}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {action || secondaryAction ? (
        <View style={styles.bannerActions}>
          {action ? <Button label={action.label} onPress={action.onPress} variant="secondary" style={styles.bannerButton} /> : null}
          {secondaryAction ? <Button label={secondaryAction.label} onPress={secondaryAction.onPress} variant="ghost" style={styles.bannerButton} /> : null}
        </View>
      ) : null}
    </View>
  );
};

// ───────────────────────── Sheets & help ─────────────────────────

export const Sheet = ({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
        </Pressable>
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Txt variant="title" style={styles.flex}>{title}</Txt>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.iconButton} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView bounces={false} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
};

/** Collapsible group. The summary stays visible so the closed state still carries information. */
export const Disclosure = ({ title, summary, defaultOpen = false, code, children }: {
  title: string; summary?: string; defaultOpen?: boolean; code?: boolean; children: ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={summary ? `${title}. ${summary}` : title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.disclosureHead, pressed && styles.pressed]}
      >
        <View style={styles.flex}>
          <Txt variant={code ? 'code' : 'heading'}>{title}</Txt>
          {summary ? <Txt variant="caption" tone="secondary">{summary}</Txt> : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textSecondary} />
      </Pressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
};

// ───────────────────────── Meter ─────────────────────────

/** Horizontal track with layered fills, an optional target band and tick marks. Values are in `max` units. */
export const Meter = ({
  max, fills, band, ticks, label, valueText, height = 12,
}: {
  max: number; fills: Array<{ value: number; color: string }>; band?: { from: number; to: number };
  ticks?: number[]; label: string; valueText: string; height?: number;
}) => {
  const pct = (value: number) => `${Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100))}%` as `${number}%`;
  const now = Math.round(fills.reduce((peak, fill) => Math.max(peak, fill.value), 0));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: Math.round(max), now: Math.min(now, Math.round(max)), text: valueText }}
      style={[styles.track, { height }]}
    >
      {band ? <View style={[styles.band, { left: pct(band.from), width: pct(band.to - band.from) }]} /> : null}
      {[...fills].sort((a, b) => b.value - a.value).map((fill, index) => (
        <View key={index} style={[styles.fill, { width: pct(fill.value), backgroundColor: fill.color }]} />
      ))}
      {ticks?.map((tick) => <View key={tick} style={[styles.tick, { left: pct(tick) }]} />)}
    </View>
  );
};

// ───────────────────────── Styles ─────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  brandName: { fontSize: 18, lineHeight: 24, letterSpacing: 0, color: colors.text },
  brandDot: { fontSize: 18, lineHeight: 24, letterSpacing: 0, color: colors.accent },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  titleBlock: { gap: space.sm },
  titleText: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.text },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: space.md, paddingVertical: space.sm, maxWidth: '100%' },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, padding: space.lg, gap: space.md },
  section: { gap: space.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm },
  stateTag: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 2, alignSelf: 'flex-start' },
  button: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.lg, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  buttonLabel: { textAlign: 'center', flexShrink: 1, fontSize: 15, lineHeight: 21 },
  buttonInactive: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, opacity: 0.85 },
  pressed: { opacity: 0.75 },
  choice: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  choiceFull: { padding: space.lg, minHeight: TOUCH },
  choiceCompact: { paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: TOUCH, alignItems: 'center' },
  choiceSelected: { borderColor: colors.accent, borderWidth: 2, backgroundColor: colors.accentSoft },
  choiceText: { flexShrink: 1, gap: 2 },
  choiceLabel: { fontWeight: '700' },
  segmented: { flexDirection: 'row', gap: space.sm },
  segment: { flex: 1, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: space.xs },
  segmentSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 2 },
  segmentText: { textAlign: 'center' },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.md },
  bannerHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  bannerBody: { flex: 1, gap: 2 },
  bannerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  bannerButton: { minHeight: TOUCH },
  pill: { minHeight: 44, paddingHorizontal: space.md, borderRadius: 22, borderWidth: 1, borderColor: colors.borderStrong, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  pillHighlight: { borderColor: colors.warning },
  iconBox: { width: TOUCH, height: TOUCH, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: colors.border },
  iconButton: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', margin: -space.sm },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', backgroundColor: colors.surfaceRaised, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.lg, paddingTop: space.sm },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: space.md },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  sheetContent: { gap: space.lg, paddingBottom: space.md },
  disclosureHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TOUCH },
  disclosureBody: { gap: space.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  track: { borderRadius: 4, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', justifyContent: 'center' },
  band: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(69,213,149,0.18)' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.textSecondary },
});
