import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PROGRESSION_FAMILY_OPTIONS,
  SCALE_FAMILY_OPTIONS,
} from '../content/curriculum';
import {
  activeVoicingFamiliesForPractice,
  availableVoicingFamiliesForConfig,
  countMatchingProgressions,
  type PotentialPhraseVariant,
} from '../lib/engine/phraseGenerator';
import type { MicConnectionState } from '../lib/audio/micAccess';
import { INSTRUMENTS, type InstrumentId } from '../lib/audio/instruments';
import type { MidiConnectionState } from '../lib/midi/midiAccess';
import { progressionRomanSummary, progressionSubtitle } from '../lib/progressionLabels';
import { VOICING_FAMILY_LABELS } from '../lib/voicingFamilies';
import type {
  ProgressionFamilyTag,
  RhythmFilterId,
  ScaleFamilyId,
  VoicingFamily,
} from '../types/music';
import type { ExerciseConfig, InputMode, ProgressState } from '../types/progress';

export type ThemeMode = 'light' | 'dark' | 'system';

interface SegOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

interface SegProps<T extends string> {
  label: string;
  value: T;
  options: Array<SegOption<T>>;
  onChange: (value: T) => void;
  fill?: boolean;
}

function Seg<T extends string>({ label, value, options, onChange, fill = false }: SegProps<T>) {
  return (
    <div className={`seg ${fill ? 'seg-fill' : ''}`.trim()} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="seg-option"
          aria-pressed={value === option.value}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface RowProps {
  label: string;
  help?: string;
  children: React.ReactNode;
}

function Row({ label, help, children }: RowProps) {
  return (
    <div>
      <div className="settings-row">
        <span className="settings-row-label">{label}</span>
        <span className="settings-row-control">{children}</span>
      </div>
      {help ? <p className="settings-help">{help}</p> : null}
    </div>
  );
}

interface SwitchRowProps {
  label: string;
  help?: string;
  checked: boolean;
  onChange: () => void;
}

function SwitchRow({ label, help, checked, onChange }: SwitchRowProps) {
  return (
    <div>
      <label className="settings-row">
        <span className="settings-row-label">{label}</span>
        <span className="switch">
          <input type="checkbox" checked={checked} onChange={onChange} />
          <span className="switch-track" />
        </span>
      </label>
      {help ? <p className="settings-help">{help}</p> : null}
    </div>
  );
}

interface CheckGroupProps<T extends string> {
  label: string;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  selected: readonly T[];
  onToggle: (value: T) => void;
  help?: string;
}

function CheckGroup<T extends string>({ label, options, selected, onToggle, help }: CheckGroupProps<T>) {
  return (
    <div>
      <p className="settings-help">{label}</p>
      <div className="settings-check-grid">
        {options.map((option) => (
          <label key={option.value} className="settings-check">
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              disabled={option.disabled}
              onChange={() => onToggle(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {help ? <p className="settings-help">{help}</p> : null}
    </div>
  );
}

const INPUT_MODE_OPTIONS: Array<{ value: InputMode; label: string; help: string }> = [
  { value: 'touch', label: 'Touch', help: 'Play the on-screen keyboard with fingers or mouse.' },
  { value: 'midi', label: 'MIDI', help: 'Play a connected MIDI keyboard.' },
  { value: 'qwerty', label: 'Keys', help: 'Play with your computer keyboard.' },
  { value: 'mic', label: 'Mic', help: 'Sing or play into your microphone and the app hears the notes.' },
];

const RHYTHM_OPTIONS: Array<{ value: RhythmFilterId; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'block_whole', label: 'Whole Notes' },
  { value: 'halves', label: 'Half Notes' },
  { value: 'quarters', label: 'Quarter Notes' },
  { value: 'charleston', label: 'Charleston' },
  { value: 'tresillo_332', label: 'Tresillo 3-3-2' },
  { value: 'backbeat_2_4', label: 'Backbeat 2 + 4' },
  { value: 'push_2and_hold', label: 'Push 2& Hold' },
  { value: 'anticipation_4and', label: 'Anticipation 4&' },
  { value: 'push_4and_hold', label: 'Push 4& Across' },
  { value: 'hold_from_3', label: 'Hold From 3' },
  { value: 'offbeat_1and_3', label: 'Offbeat 1& + 3' },
  { value: 'syncopated_2and_4', label: 'Syncopated 2& + 4' },
  { value: 'late_pickup_4', label: 'Pickup 4' },
  { value: 'floating_2and', label: 'Floating 2&' },
];

interface PracticeSettingsDrawerProps {
  progress: ProgressState;
  inputMode: InputMode;
  midiState: MidiConnectionState;
  micState: MicConnectionState;
  potentialProgressionCount: number;
  potentialPhraseVariants: PotentialPhraseVariant[];
  authConfigured: boolean;
  authEmail: string | null;
  authStatusText: string | null;
  cloudSyncState: 'offline' | 'idle' | 'sending_link' | 'syncing' | 'synced' | 'error';
  theme: ThemeMode;
  onSetTheme: (theme: ThemeMode) => void;
  immersiveMode: boolean;
  onToggleImmersiveMode: () => void;
  keyboardVisible: boolean;
  onToggleKeyboardVisible: () => void;
  clef: 'treble' | 'bass';
  onToggleClef: () => void;
  practiceTrackingMode: 'test' | 'play';
  onTogglePracticeTrackingMode: () => void;
  exerciseLocked: boolean;
  onToggleExerciseLock: () => void;
  keyLocked: boolean;
  onToggleKeyLock: () => void;
  initialSection?: 'input' | null;
  onClose: () => void;
  onOpenProgress: () => void;
  onRequestEmailSignIn: (email: string) => void;
  onSignOut: () => void;
  onSyncNow: () => void;
  onSelectRhythm: (rhythm: RhythmFilterId) => void;
  onSelectImprovisationAdvanceMode: (
    mode: ProgressState['exerciseConfig']['improvisationAdvanceMode'],
  ) => void;
  onToggleSelectedVoicing: (voicingFamily: VoicingFamily) => void;
  onToggleScaleFamily: (scaleFamilyId: ScaleFamilyId) => void;
  onToggleProgressionFamily: (progressionFamilyTag: ProgressionFamilyTag) => void;
  onSelectInputMode: (mode: InputMode) => void;
  onSelectMidiInput: (inputId: string | null) => void;
  onEnableMicrophone: () => void;
  onTogglePlayInputNotes: () => void;
  onSelectInstrument: (instrument: InstrumentId) => void;
  onPreviewInstrument: () => void;
  onChangeVolume: (volume: number) => void;
  onChangeMetronomeVolume: (volume: number) => void;
}

export function PracticeSettingsDrawer({
  progress,
  inputMode,
  midiState,
  micState,
  potentialProgressionCount,
  potentialPhraseVariants,
  authConfigured,
  authEmail,
  authStatusText,
  cloudSyncState,
  theme,
  onSetTheme,
  immersiveMode,
  onToggleImmersiveMode,
  keyboardVisible,
  onToggleKeyboardVisible,
  clef,
  onToggleClef,
  practiceTrackingMode,
  onTogglePracticeTrackingMode,
  exerciseLocked,
  onToggleExerciseLock,
  keyLocked,
  onToggleKeyLock,
  initialSection,
  onClose,
  onOpenProgress,
  onRequestEmailSignIn,
  onSignOut,
  onSyncNow,
  onSelectRhythm,
  onSelectImprovisationAdvanceMode,
  onToggleSelectedVoicing,
  onToggleScaleFamily,
  onToggleProgressionFamily,
  onSelectInputMode,
  onSelectMidiInput,
  onEnableMicrophone,
  onTogglePlayInputNotes,
  onSelectInstrument,
  onPreviewInstrument,
  onChangeVolume,
  onChangeMetronomeVolume,
}: PracticeSettingsDrawerProps) {
  const [emailInput, setEmailInput] = useState('');
  const [potentialDetailsOpen, setPotentialDetailsOpen] = useState(false);
  const inputSectionRef = useRef<HTMLElement | null>(null);
  const isImprovisationMode = progress.exerciseConfig.mode === 'improvisation';
  const config = progress.exerciseConfig;
  const activeVoicings = useMemo(
    () => activeVoicingFamiliesForPractice(progress),
    [progress],
  );
  const availableVoicings = useMemo(
    () => availableVoicingFamiliesForConfig(config),
    [config],
  );
  const potentialProgressionGroups = useMemo(() => {
    const grouped = new Map<string, { progression: PotentialPhraseVariant['progression']; phrases: PotentialPhraseVariant[] }>();

    potentialPhraseVariants.forEach((variant) => {
      const existing = grouped.get(variant.progression.id);
      if (existing) {
        existing.phrases.push(variant);
        return;
      }

      grouped.set(variant.progression.id, {
        progression: variant.progression,
        phrases: [variant],
      });
    });

    return [...grouped.values()];
  }, [potentialPhraseVariants]);
  const optionAvailability = useMemo(() => {
    const withConfig = (nextConfig: ExerciseConfig): boolean => countMatchingProgressions(nextConfig) > 0;
    const toggleArrayItem = <T extends string>(items: T[], item: T): T[] =>
      (items.includes(item) ? items.filter((value) => value !== item) : [...items, item]);

    return {
      scaleFamilies: Object.fromEntries(SCALE_FAMILY_OPTIONS.map((family) => [
        family.id,
        withConfig({ ...config, enabledScaleFamilyIds: toggleArrayItem(config.enabledScaleFamilyIds, family.id) }),
      ])),
      progressionFamilies: Object.fromEntries(PROGRESSION_FAMILY_OPTIONS.map((family) => [
        family.id,
        withConfig({
          ...config,
          enabledProgressionFamilyTags: toggleArrayItem(config.enabledProgressionFamilyTags, family.id),
        }),
      ])),
    };
  }, [config]);

  useEffect(() => {
    if (initialSection === 'input') {
      inputSectionRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [initialSection]);

  return (
    <div className="settings-overlay" role="presentation" onClick={onClose}>
      <aside
        className="settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Practice settings"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings-header">
          <h2>Settings</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings" title="Close">
            ×
          </button>
        </header>

        <section className="settings-section" id="settings-input" ref={inputSectionRef}>
          <h3>Input</h3>
          <Row
            label="Input mode"
            help={INPUT_MODE_OPTIONS.find((option) => option.value === inputMode)?.help}
          >
            <Seg
              label="Input source"
              value={inputMode}
              options={INPUT_MODE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
                disabled: (option.value === 'midi' && !midiState.supported)
                  || (option.value === 'mic' && !micState.supported),
                title: option.value === 'midi' && !midiState.supported
                  ? 'Web MIDI isn\'t available in this browser. Use Chrome, or the iOS app (coming later).'
                  : undefined,
              }))}
              onChange={onSelectInputMode}
            />
          </Row>
          {!midiState.supported ? (
            <p className="settings-help">Web MIDI isn't available in this browser. Use Chrome, or the iOS app (coming later).</p>
          ) : null}
          {!micState.supported ? (
            <p className="settings-help">Microphone input is unavailable in this browser.</p>
          ) : null}
          {inputMode === 'midi' ? (
            <Row
              label="Device"
              help={midiState.activeInputId
                ? `Connected: ${midiState.inputs.find((input) => input.id === midiState.activeInputId)?.name ?? 'MIDI device'}`
                : 'No MIDI devices found'}
            >
              <select
                className="settings-select"
                aria-label="MIDI device"
                value={midiState.activeInputId ?? ''}
                onChange={(event) => onSelectMidiInput(event.target.value || null)}
                disabled={midiState.inputs.length === 0}
              >
                {midiState.inputs.length === 0 ? (
                  <option value="">No MIDI devices found</option>
                ) : (
                  midiState.inputs.map((input) => (
                    <option key={input.id} value={input.id}>{input.name}</option>
                  ))
                )}
              </select>
            </Row>
          ) : null}
          {inputMode === 'mic' && !micState.ready ? (
            <Row
              label="Microphone"
              help={micState.error ? `Mic status: ${micState.error}` : 'Mic status: waiting for permission.'}
            >
              <button type="button" className="primary" onClick={onEnableMicrophone}>Enable microphone</button>
            </Row>
          ) : null}
          <SwitchRow
            label="Play my notes"
            help="Turn off if your MIDI keyboard makes its own sound."
            checked={progress.settings.playInputNotes}
            onChange={onTogglePlayInputNotes}
          />
          {isImprovisationMode ? (
            <Row
              label="Chord change"
              help={inputMode !== 'midi'
                ? 'Connect MIDI with a sustain pedal to use Footpedal Release.'
                : 'Footpedal Release advances only when the sustain pedal lifts after a landing chord.'}
            >
              <Seg
                label="Chord change mode"
                value={config.improvisationAdvanceMode}
                options={[
                  { value: 'immediate', label: 'Immediate' },
                  { value: 'footpedal_release', label: 'Footpedal', disabled: inputMode !== 'midi' },
                ]}
                onChange={onSelectImprovisationAdvanceMode}
              />
            </Row>
          ) : null}
        </section>

        <section className="settings-section">
          <h3>Sound</h3>
          <Row
            label="Instrument"
            help={INSTRUMENTS.find((instrument) => instrument.id === progress.settings.instrument)?.description}
          >
            <select
              className="settings-select"
              aria-label="Instrument"
              value={progress.settings.instrument}
              onChange={(event) => onSelectInstrument(event.target.value as InstrumentId)}
            >
              {INSTRUMENTS.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>{instrument.label}</option>
              ))}
            </select>
          </Row>
          <Row label="Preview">
            <button type="button" onClick={onPreviewInstrument}>Play a chord</button>
          </Row>
          <Row label={`Volume ${Math.round(progress.settings.volume * 100)}%`}>
            <input
              className="settings-range"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={progress.settings.volume}
              onChange={(event) => onChangeVolume(Number(event.target.value))}
              aria-label="Master volume"
            />
          </Row>
          <Row label={`Metronome volume ${Math.round(progress.settings.metronomeVolume * 100)}%`}>
            <input
              className="settings-range"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={progress.settings.metronomeVolume}
              onChange={(event) => onChangeMetronomeVolume(Number(event.target.value))}
              aria-label="Metronome volume"
            />
          </Row>
          <p className="settings-help">
            <a href={`${import.meta.env.BASE_URL}sounds/CREDITS.md`} target="_blank" rel="noreferrer">Sound credits</a>
          </p>
        </section>

        <section className="settings-section">
          <h3>Practice</h3>
          <Row
            label="Tracking"
            help="Test counts attempts and mastery. Play practises freely without counting progress."
          >
            <Seg
              label="Practice tracking mode"
              value={practiceTrackingMode}
              options={[
                { value: 'test', label: 'Test' },
                { value: 'play', label: 'Play' },
              ]}
              onChange={() => onTogglePracticeTrackingMode()}
            />
          </Row>
          <SwitchRow
            label="Lock exercise"
            help="Keep the current exercise when a new phrase is generated."
            checked={exerciseLocked}
            onChange={onToggleExerciseLock}
          />
          <SwitchRow
            label="Lock key"
            help="Keep the current key when a new phrase is generated."
            checked={keyLocked}
            onChange={onToggleKeyLock}
          />
          <CheckGroup
            label="Rhythms"
            options={RHYTHM_OPTIONS}
            selected={config.rhythm}
            onToggle={onSelectRhythm}
          />
          <CheckGroup
            label="Voicings"
            options={availableVoicings.map((voicing) => ({ value: voicing, label: VOICING_FAMILY_LABELS[voicing] }))}
            selected={activeVoicings}
            onToggle={onToggleSelectedVoicing}
            help={activeVoicings.length > 0
              ? `Current set: ${activeVoicings.map((voicing) => VOICING_FAMILY_LABELS[voicing]).join(', ')}`
              : 'No compatible voicings for the current content.'}
          />
          <CheckGroup
            label="Scale families"
            options={SCALE_FAMILY_OPTIONS.map((family) => ({
              value: family.id,
              label: family.label,
              disabled: !optionAvailability.scaleFamilies[family.id],
            }))}
            selected={config.enabledScaleFamilyIds}
            onToggle={onToggleScaleFamily}
            help="Filter guided and improvisation material by the scale vocab you want in play."
          />
          <CheckGroup
            label="Progression families"
            options={PROGRESSION_FAMILY_OPTIONS.map((family) => ({
              value: family.id,
              label: family.label,
              disabled: !optionAvailability.progressionFamilies[family.id],
            }))}
            selected={config.enabledProgressionFamilyTags}
            onToggle={onToggleProgressionFamily}
            help="Shape the harmonic motion, from cadences and loops up to altered dominant and symmetric color."
          />
          <div className="settings-potential">
            <button
              type="button"
              className="settings-potential-toggle"
              onClick={() => setPotentialDetailsOpen((open) => !open)}
              aria-expanded={potentialDetailsOpen}
              disabled={potentialPhraseVariants.length === 0}
            >
              <span>Potential progressions <strong>{potentialProgressionCount.toLocaleString()}</strong></span>
              <span className="settings-potential-action">
                {potentialPhraseVariants.length === 0
                  ? 'No phrases'
                  : potentialDetailsOpen
                    ? 'Hide phrases'
                    : `Show ${potentialPhraseVariants.length.toLocaleString()} phrases`}
              </span>
            </button>
            {potentialDetailsOpen ? (
              <div className="settings-potential-group-list">
                {potentialProgressionGroups.map((group) => (
                  <section key={group.progression.id} className="settings-potential-group">
                    <div className="settings-potential-group-copy">
                      <strong>{progressionRomanSummary(group.progression)}</strong>
                      <span>{progressionSubtitle(group.progression.id)}</span>
                    </div>
                    <div className="settings-potential-phrase-list">
                      {group.phrases.map((variant) => (
                        <span
                          key={`${variant.progression.id}:${variant.tonic}:${variant.voicingFamily}`}
                          className="settings-potential-phrase"
                        >
                          {variant.tonic} · {VOICING_FAMILY_LABELS[variant.voicingFamily]}
                        </span>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="settings-section">
          <h3>Display</h3>
          <Row label="Theme">
            <Seg
              label="Theme"
              value={theme}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' },
              ]}
              onChange={onSetTheme}
            />
          </Row>
          <Row label="Clef">
            <Seg
              label="Staff clef"
              value={clef}
              options={[
                { value: 'treble', label: 'Treble' },
                { value: 'bass', label: 'Bass' },
              ]}
              onChange={() => onToggleClef()}
            />
          </Row>
          <SwitchRow
            label="Show keyboard"
            checked={keyboardVisible}
            onChange={onToggleKeyboardVisible}
          />
          <SwitchRow
            label="Immersive mode"
            help="Fill the whole screen with the practice surface."
            checked={immersiveMode}
            onChange={onToggleImmersiveMode}
          />
        </section>

        <section className="settings-section">
          <h3>Account</h3>
          {!authConfigured ? (
            <p className="settings-help">Cloud save is disabled until Supabase env vars are configured at build time.</p>
          ) : null}
          {authConfigured && !authEmail ? (
            <Row label="Sign in" help="We email you a magic sign-in link.">
              <input
                type="email"
                className="settings-text-input"
                placeholder="name@example.com"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
              />
              <button
                type="button"
                className="primary"
                onClick={() => onRequestEmailSignIn(emailInput.trim())}
                disabled={emailInput.trim().length === 0 || cloudSyncState === 'sending_link'}
              >
                {cloudSyncState === 'sending_link' ? 'Sending…' : 'Email link'}
              </button>
            </Row>
          ) : null}
          <div className="settings-actions">
            <button type="button" className="primary" onClick={onOpenProgress}>View Progress</button>
            {authConfigured && authEmail ? (
              <>
                <button type="button" onClick={onSyncNow}>Sync Now</button>
                <button type="button" onClick={onSignOut}>Sign Out</button>
              </>
            ) : null}
          </div>
          {authEmail ? (
            <p className="settings-meta">Signed in as {authEmail}</p>
          ) : null}
          {authConfigured ? (
            <p className="settings-meta">
              Cloud sync: {cloudSyncState === 'synced'
                ? 'Synced'
                : cloudSyncState === 'syncing'
                  ? 'Syncing…'
                  : cloudSyncState === 'sending_link'
                    ? 'Sending link…'
                    : cloudSyncState === 'error'
                      ? 'Error'
                      : 'Local only'}
            </p>
          ) : null}
          {authStatusText ? (
            <p className="settings-meta">{authStatusText}</p>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
