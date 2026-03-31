import { useMemo, useState } from 'react';
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
import { progressionRomanSummary, progressionSubtitle } from '../lib/progressionLabels';
import { VOICING_FAMILY_LABELS } from '../lib/voicingFamilies';
import type {
  ProgressionFamilyTag,
  RhythmFilterId,
  ScaleFamilyId,
  VoicingFamily,
} from '../types/music';
import type { ExerciseConfig, ProgressState } from '../types/progress';

interface PracticeSettingsDrawerProps {
  progress: ProgressState;
  inputMode: 'midi' | 'qwerty';
  potentialProgressionCount: number;
  potentialPhraseVariants: PotentialPhraseVariant[];
  authConfigured: boolean;
  authEmail: string | null;
  authStatusText: string | null;
  cloudSyncState: 'offline' | 'idle' | 'sending_link' | 'syncing' | 'synced' | 'error';
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
  onToggleComputerKeyboardAudio: () => void;
}

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

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.8 19.2a6.2 6.2 0 0 1 12.4 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function PracticeSettingsDrawer({
  progress,
  inputMode,
  potentialProgressionCount,
  potentialPhraseVariants,
  authConfigured,
  authEmail,
  authStatusText,
  cloudSyncState,
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
  onToggleComputerKeyboardAudio,
}: PracticeSettingsDrawerProps) {
  const [emailInput, setEmailInput] = useState('');
  const [potentialDetailsOpen, setPotentialDetailsOpen] = useState(false);
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
          <div>
            <p className="eyebrow">Practice Settings</p>
            <h2>Configure the exercise surface</h2>
          </div>
          <button type="button" className="icon-button settings-close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </header>
        <section className="settings-section">
          <div className="settings-profile-head">
            <span className="settings-profile-icon" aria-hidden="true">
              <PersonIcon />
            </span>
            <div className="settings-section-copy">
              <h3>Profile</h3>
              {!authConfigured ? <p>Cloud save is disabled until Supabase env vars are configured at build time.</p> : null}
              {authConfigured && !authEmail ? <p>Sign in to sync your progress.</p> : null}
            </div>
          </div>
          <div className="settings-actions">
            <button type="button" onClick={onOpenProgress}>View Progress</button>
            {authConfigured && authEmail ? (
              <>
                <button type="button" onClick={onSyncNow}>Sync Now</button>
                <button type="button" onClick={onSignOut}>Sign Out</button>
              </>
            ) : null}
          </div>
          {authConfigured && !authEmail ? (
            <div className="settings-auth-row">
              <input
                type="email"
                className="settings-text-input"
                placeholder="name@example.com"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
              />
              <button
                type="button"
                onClick={() => onRequestEmailSignIn(emailInput.trim())}
                disabled={emailInput.trim().length === 0 || cloudSyncState === 'sending_link'}
              >
                {cloudSyncState === 'sending_link' ? 'Sending…' : 'Email Sign-In Link'}
              </button>
            </div>
          ) : null}
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

        <section className={`settings-micro-meta-card ${potentialDetailsOpen ? 'expanded' : ''}`.trim()}>
          <button
            type="button"
            className="settings-micro-meta"
            onClick={() => setPotentialDetailsOpen((open) => !open)}
            aria-expanded={potentialDetailsOpen}
            disabled={potentialPhraseVariants.length === 0}
          >
            <span className="settings-micro-meta-copy">
              <span className="settings-meta-label">Potential progressions</span>
              <strong>{potentialProgressionCount.toLocaleString()}</strong>
            </span>
            <span className="settings-micro-meta-action">
              {potentialPhraseVariants.length === 0
                ? 'No phrases'
                : potentialDetailsOpen
                  ? 'Hide phrases'
                  : `Show ${potentialPhraseVariants.length.toLocaleString()} phrases`}
            </span>
          </button>
          {potentialDetailsOpen ? (
            <div className="settings-potential-details">
              <p className="settings-meta">Grouped by progression. Rhythm variants are not counted separately.</p>
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
            </div>
          ) : null}
        </section>

        <section className="settings-section">
          <div className="settings-section-copy">
            <h3>Rhythm</h3>
          </div>
          <div className="settings-pill-row">
            {RHYTHM_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`settings-pill ${progress.exerciseConfig.rhythm.includes(option.value) ? 'active' : ''}`.trim()}
                onClick={() => onSelectRhythm(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-copy">
            <h3>Voicing Focus</h3>
            <p>{isImprovisationMode
              ? 'Suggested from simplest to densest. Toggle the voicings you want rotating inside the current content.'
              : (progress.exerciseConfig.mode === 'chord_flashcards'
                ? 'Suggested from simplest to densest. In flashcards, selected voicings are all accepted ways to answer each chord.'
                : 'Suggested from simplest to densest. Toggle the voicings you want rotating inside the current content.')}
            </p>
          </div>
          <p className="settings-meta">
            {activeVoicings.length > 0
              ? `Current set: ${activeVoicings.map((voicing) => VOICING_FAMILY_LABELS[voicing]).join(', ')}`
              : 'No compatible voicings for the current content.'}
          </p>
          <div className="settings-pill-row">
            {availableVoicings.map((voicingFamily) => {
              const selected = activeVoicings.includes(voicingFamily);

              return (
                <button
                  key={voicingFamily}
                  type="button"
                  className={`settings-pill ${selected ? 'active' : ''}`.trim()}
                  onClick={() => onToggleSelectedVoicing(voicingFamily)}
                  title={VOICING_FAMILY_LABELS[voicingFamily]}
                >
                  {VOICING_FAMILY_LABELS[voicingFamily]}
                </button>
              );
            })}
          </div>
          {potentialProgressionCount === 0 ? (
            <p className="settings-meta">No compatible progressions for the current voicing selection with these content filters.</p>
          ) : null}
        </section>

        <section className="settings-section">
          <div className="settings-section-copy">
            <h3>Scale Families</h3>
            <p>Filter both guided and improvisation material by the scale vocab you want in play.</p>
          </div>
          <div className="settings-pill-row">
            {SCALE_FAMILY_OPTIONS.map((family) => (
              <button
                key={family.id}
                type="button"
                className={`settings-pill ${progress.exerciseConfig.enabledScaleFamilyIds.includes(family.id) ? 'active' : ''}`.trim()}
                disabled={!optionAvailability.scaleFamilies[family.id]}
                onClick={() => onToggleScaleFamily(family.id)}
              >
                {family.label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-copy">
            <h3>Progression Families</h3>
            <p>Shape the harmonic motion, from cadences and loops up to altered dominant and symmetric color.</p>
          </div>
          <div className="settings-pill-row">
            {PROGRESSION_FAMILY_OPTIONS.map((family) => (
              <button
                key={family.id}
                type="button"
                className={`settings-pill ${progress.exerciseConfig.enabledProgressionFamilyTags.includes(family.id) ? 'active' : ''}`.trim()}
                disabled={!optionAvailability.progressionFamilies[family.id]}
                onClick={() => onToggleProgressionFamily(family.id)}
              >
                {family.label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-copy">
            <h3>Computer Keyboard</h3>
            <p>Use the computer keyboard when MIDI is disconnected.</p>
          </div>
          <div className="settings-toggle-inline">
            <strong>Computer Audio</strong>
            <div className="practice-mode-toggle settings-segmented-toggle" role="tablist" aria-label="Computer audio">
              <button
                type="button"
                className={`practice-mode-toggle-option ${!progress.settings.enableComputerKeyboardAudio ? 'active' : ''}`.trim()}
                aria-pressed={!progress.settings.enableComputerKeyboardAudio}
                onClick={onToggleComputerKeyboardAudio}
              >
                Off
              </button>
              <button
                type="button"
                className={`practice-mode-toggle-option ${progress.settings.enableComputerKeyboardAudio ? 'active' : ''}`.trim()}
                aria-pressed={progress.settings.enableComputerKeyboardAudio}
                onClick={onToggleComputerKeyboardAudio}
              >
                On
              </button>
            </div>
          </div>
          {inputMode === 'qwerty' ? (
            <p className="settings-meta">Computer audio is always on while MIDI is disconnected. This toggle sets what happens once MIDI reconnects.</p>
          ) : (
            <p className="settings-meta">This toggle controls computer audio while MIDI is connected. If MIDI disconnects, computer audio turns on automatically.</p>
          )}
        </section>

        {isImprovisationMode ? (
          <section className="settings-section">
              <div className="settings-section-copy">
                <h3>Chord Change</h3>
                <p>Immediate keeps improvisation moving. Footpedal Release only advances when the sustain pedal is released right around the accepted landing chord.</p>
              </div>
              <div className="settings-pill-row">
                <button
                  type="button"
                  className={`settings-pill ${progress.exerciseConfig.improvisationAdvanceMode === 'immediate' ? 'active' : ''}`.trim()}
                  onClick={() => onSelectImprovisationAdvanceMode('immediate')}
                >
                  Immediate
                </button>
                <button
                  type="button"
                  className={`settings-pill ${progress.exerciseConfig.improvisationAdvanceMode === 'footpedal_release' ? 'active' : ''}`.trim()}
                  disabled={inputMode !== 'midi'}
                  onClick={() => onSelectImprovisationAdvanceMode('footpedal_release')}
                >
                  Footpedal Release
                </button>
              </div>
              {inputMode !== 'midi' ? (
                <p className="settings-meta">Connect MIDI with a sustain pedal to use Footpedal Release.</p>
              ) : null}
          </section>
        ) : null}

      </aside>
    </div>
  );
}
