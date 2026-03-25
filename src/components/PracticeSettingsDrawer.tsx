import { useMemo, useState } from 'react';
import {
  applyCurriculumPreset,
  CONTENT_BLOCKS,
  CURRICULUM_PRESETS,
  KEY_SET_OPTIONS,
  PROGRESSION_FAMILY_OPTIONS,
  SCALE_FAMILY_OPTIONS,
} from '../content/curriculum';
import {
  activeVoicingFamiliesForPractice,
  countMatchingProgressions,
  type PotentialPhraseVariant,
} from '../lib/engine/phraseGenerator';
import { progressionRomanSummary, progressionSubtitle } from '../lib/progressionLabels';
import { orderedVoicingFamilies, VOICING_FAMILY_LABELS, VOICING_FAMILIES_IN_ORDER } from '../lib/voicingFamilies';
import type {
  ContentBlockId,
  CurriculumPresetId,
  KeySetId,
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
  onSelectMode: (mode: ProgressState['exerciseConfig']['mode']) => void;
  onSelectGuidedFlowMode: (mode: ProgressState['exerciseConfig']['guidedFlowMode']) => void;
  onSelectCurriculumPreset: (presetId: CurriculumPresetId) => void;
  onSelectKeySet: (keySet: KeySetId) => void;
  onSelectRhythm: (rhythm: RhythmFilterId) => void;
  onSelectImprovisationProgressionMode: (
    mode: ProgressState['exerciseConfig']['improvisationProgressionMode'],
  ) => void;
  onSelectImprovisationAdvanceMode: (
    mode: ProgressState['exerciseConfig']['improvisationAdvanceMode'],
  ) => void;
  onSetChainMovement: (chainMovement: number) => void;
  onSelectVoicingPracticeMode: (mode: ProgressState['exerciseConfig']['voicingPracticeMode']) => void;
  onToggleSelectedVoicing: (voicingFamily: VoicingFamily) => void;
  onToggleContentBlock: (contentBlockId: ContentBlockId) => void;
  onToggleScaleFamily: (scaleFamilyId: ScaleFamilyId) => void;
  onToggleProgressionFamily: (progressionFamilyTag: ProgressionFamilyTag) => void;
  onToggleComputerKeyboardAudio: () => void;
  onToggleKeyboardFriendlyVoicings: () => void;
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
  onSelectMode,
  onSelectGuidedFlowMode,
  onSelectCurriculumPreset,
  onSelectKeySet,
  onSelectRhythm,
  onSelectImprovisationProgressionMode,
  onSelectImprovisationAdvanceMode,
  onSetChainMovement,
  onSelectVoicingPracticeMode,
  onToggleSelectedVoicing,
  onToggleContentBlock,
  onToggleScaleFamily,
  onToggleProgressionFamily,
  onToggleComputerKeyboardAudio,
  onToggleKeyboardFriendlyVoicings,
}: PracticeSettingsDrawerProps) {
  const [emailInput, setEmailInput] = useState('');
  const [potentialDetailsOpen, setPotentialDetailsOpen] = useState(false);
  const isImprovisationMode = progress.exerciseConfig.mode === 'improvisation';
  const config = progress.exerciseConfig;
  const selectedKeySet = KEY_SET_OPTIONS.find((option) => option.id === progress.exerciseConfig.keySet) ?? null;
  const activeAutoVoicings = useMemo(
    () => activeVoicingFamiliesForPractice(progress),
    [progress],
  );
  const selectedCustomVoicings = useMemo(
    () => orderedVoicingFamilies(config.selectedVoicings),
    [config.selectedVoicings],
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
      presets: Object.fromEntries(CURRICULUM_PRESETS.map((preset) => [
        preset.id,
        withConfig(applyCurriculumPreset(config, preset.id)),
      ])),
      keySets: Object.fromEntries(KEY_SET_OPTIONS.map((option) => [
        option.id,
        withConfig({ ...config, keySet: option.id }),
      ])),
      contentBlocks: Object.fromEntries(CONTENT_BLOCKS.map((block) => [
        block.id,
        withConfig({ ...config, enabledContentBlockIds: toggleArrayItem(config.enabledContentBlockIds, block.id) }),
      ])),
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

        <section className="settings-section">
          <div className="settings-section-copy">
            <h3>Practice Mode</h3>
            <p>Switch between strict chord drilling and the scale-guided improvisation path.</p>
          </div>
          <div className="settings-pill-row">
            <button
              type="button"
              className={`settings-pill ${progress.exerciseConfig.mode === 'guided' ? 'active' : ''}`.trim()}
              onClick={() => onSelectMode('guided')}
            >
              Guided
            </button>
            <button
              type="button"
              className={`settings-pill ${progress.exerciseConfig.mode === 'improvisation' ? 'active' : ''}`.trim()}
              onClick={() => onSelectMode('improvisation')}
            >
              Improvisation
            </button>
          </div>
        </section>

        {isImprovisationMode ? (
          <section className="settings-section">
            <div className="settings-section-copy">
              <h3>Improvisation Flow</h3>
              <p>Choose between free random variety, weakest-material targeting, or chaining each new phrase from the last one.</p>
            </div>

            <div className="settings-pill-row">
              <button
                type="button"
                className={`settings-pill ${progress.exerciseConfig.improvisationProgressionMode === 'random' ? 'active' : ''}`.trim()}
                onClick={() => onSelectImprovisationProgressionMode('random')}
              >
                Random
              </button>
              <button
                type="button"
                className={`settings-pill ${progress.exerciseConfig.improvisationProgressionMode === 'targeting_improvement' ? 'active' : ''}`.trim()}
                onClick={() => onSelectImprovisationProgressionMode('targeting_improvement')}
              >
                Targeting Improvement
              </button>
              <button
                type="button"
                className={`settings-pill ${progress.exerciseConfig.improvisationProgressionMode === 'chained' ? 'active' : ''}`.trim()}
                onClick={() => onSelectImprovisationProgressionMode('chained')}
              >
                Chained
              </button>
            </div>

            <div className="settings-slider-stack">
              <div className="settings-slider-copy">
                <strong>Flow Motion</strong>
                <span>{progress.exerciseConfig.chainMovement}% moving</span>
              </div>
              <input
                className="settings-range"
                type="range"
                min={0}
                max={100}
                step={1}
                value={progress.exerciseConfig.chainMovement}
                onChange={(event) => onSetChainMovement(Number(event.target.value))}
                aria-label="Improvisation flow motion"
              />
              <div className="settings-range-labels" aria-hidden="true">
                <span>Repetitive</span>
                <span>Moving</span>
              </div>
              <p className="settings-meta">Repetitive repeats recent or weak material more often. Moving prefers less recent progressions and exits short loops sooner.</p>
            </div>
          </section>
        ) : (
          <section className="settings-section">
            <div className="settings-section-copy">
              <h3>Guided Flow</h3>
              <p>Choose between pure random variety, weakest-material targeting, or chaining musically from the previous phrase.</p>
            </div>

            <div className="settings-pill-row">
              <button
                type="button"
                className={`settings-pill ${progress.exerciseConfig.guidedFlowMode === 'random' ? 'active' : ''}`.trim()}
                onClick={() => onSelectGuidedFlowMode('random')}
              >
                Random
              </button>
              <button
                type="button"
                className={`settings-pill ${progress.exerciseConfig.guidedFlowMode === 'targeting_improvement' ? 'active' : ''}`.trim()}
                onClick={() => onSelectGuidedFlowMode('targeting_improvement')}
              >
                Targeting Improvement
              </button>
              <button
                type="button"
                className={`settings-pill ${progress.exerciseConfig.guidedFlowMode === 'musical_chaining' ? 'active' : ''}`.trim()}
                onClick={() => onSelectGuidedFlowMode('musical_chaining')}
              >
                Chained
              </button>
            </div>

            <div className="settings-slider-stack">
              <div className="settings-slider-copy">
                <strong>Flow Motion</strong>
                <span>{progress.exerciseConfig.chainMovement}% moving</span>
              </div>
              <input
                className="settings-range"
                type="range"
                min={0}
                max={100}
                step={1}
                value={progress.exerciseConfig.chainMovement}
                onChange={(event) => onSetChainMovement(Number(event.target.value))}
                aria-label="Guided flow motion"
              />
              <div className="settings-range-labels" aria-hidden="true">
                <span>Repetitive</span>
                <span>Moving</span>
              </div>
              <p className="settings-meta">Repetitive repeats recent or weak material more often. Moving prefers less recent progressions and exits short loops sooner.</p>
            </div>
          </section>
        )}

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
            <h3>Curriculum</h3>
            <p>Choose what you want to practice.</p>
          </div>
          <div className="settings-lane-grid">
            {CURRICULUM_PRESETS.map((preset) => {
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`settings-lane-card ${progress.exerciseConfig.curriculumPresetId === preset.id ? 'selected' : ''}`.trim()}
                  disabled={!optionAvailability.presets[preset.id]}
                  onClick={() => onSelectCurriculumPreset(preset.id)}
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.description}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-copy">
            <h3>Voicing Focus</h3>
            <p>Auto follows the assistive progression. Custom gives direct control over the voicing families in rotation.</p>
          </div>
          <div className="settings-pill-row">
            <button
              type="button"
              className={`settings-pill ${config.voicingPracticeMode === 'auto' ? 'active' : ''}`.trim()}
              onClick={() => onSelectVoicingPracticeMode('auto')}
            >
              Auto
            </button>
            <button
              type="button"
              className={`settings-pill ${config.voicingPracticeMode === 'custom' ? 'active' : ''}`.trim()}
              onClick={() => onSelectVoicingPracticeMode('custom')}
            >
              Custom
            </button>
          </div>
          <p className="settings-meta">
            {config.voicingPracticeMode === 'auto'
              ? `Currently active pool: ${activeAutoVoicings.length > 0
                ? activeAutoVoicings.map((voicing) => VOICING_FAMILY_LABELS[voicing]).join(', ')
                : 'No compatible voicings for the current content.'}`
              : `Custom set: ${selectedCustomVoicings.map((voicing) => VOICING_FAMILY_LABELS[voicing]).join(', ')}`}
          </p>
          {config.voicingPracticeMode === 'custom' ? (
            <div className="settings-pill-row">
              {VOICING_FAMILIES_IN_ORDER.map((voicingFamily) => {
                const selected = selectedCustomVoicings.includes(voicingFamily);

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
          ) : null}
          {config.voicingPracticeMode === 'custom' && potentialProgressionCount === 0 ? (
            <p className="settings-meta">No compatible progressions for the current custom voicing set with these content filters.</p>
          ) : null}
        </section>

        <section className="settings-section">
          <div className="settings-section-copy">
            <h3>Content Blocks</h3>
            <p>Combine harmonic vocab blocks directly instead of relying on one fixed lane combination.</p>
          </div>
          <div className="settings-pill-row">
            {CONTENT_BLOCKS.map((block) => (
              <button
                key={block.id}
                type="button"
                className={`settings-pill ${progress.exerciseConfig.enabledContentBlockIds.includes(block.id) ? 'active' : ''}`.trim()}
                disabled={!optionAvailability.contentBlocks[block.id]}
                onClick={() => onToggleContentBlock(block.id)}
                title={block.description}
              >
                {block.label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-copy">
            <h3>Key Set</h3>
            <p>Choose how broadly the generator should transpose the selected content.</p>
          </div>
          <div className="settings-pill-row">
            {KEY_SET_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`settings-pill ${progress.exerciseConfig.keySet === option.id ? 'active' : ''}`.trim()}
                disabled={!optionAvailability.keySets[option.id]}
                onClick={() => onSelectKeySet(option.id)}
                title={option.description}
              >
                {option.label}
              </button>
            ))}
          </div>
          {selectedKeySet ? (
            <p className="settings-meta">Included keys: {selectedKeySet.description}</p>
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
          <div className="settings-toggle-stack">
            <button
              type="button"
              className={`settings-toggle-card ${progress.settings.keyboardFriendlyVoicings ? 'active' : ''}`.trim()}
              disabled={inputMode === 'midi'}
              aria-pressed={progress.settings.keyboardFriendlyVoicings}
              onClick={onToggleKeyboardFriendlyVoicings}
            >
              <div className="settings-toggle-head">
                <strong>Keyboard Friendly</strong>
                <span className="settings-toggle-state">{progress.settings.keyboardFriendlyVoicings ? 'On' : 'Off'}</span>
              </div>
              <span>{inputMode === 'qwerty'
                ? 'Constrain generated voicings to the qwerty range.'
                : 'Available when MIDI is disconnected.'}</span>
            </button>
            <button
              type="button"
              className={`settings-toggle-card ${progress.settings.enableComputerKeyboardAudio ? 'active' : ''}`.trim()}
              aria-pressed={progress.settings.enableComputerKeyboardAudio}
              onClick={onToggleComputerKeyboardAudio}
            >
              <div className="settings-toggle-head">
                <strong>Computer Audio</strong>
                <span className="settings-toggle-state">{progress.settings.enableComputerKeyboardAudio ? 'On' : 'Off'}</span>
              </div>
              <span>Play incoming notes through the laptop or desktop speakers, even when using MIDI input.</span>
            </button>
          </div>
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
