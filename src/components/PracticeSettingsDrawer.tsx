import { useMemo } from 'react';
import {
  applyCurriculumPreset,
  CONTENT_BLOCKS,
  CURRICULUM_PRESETS,
  KEY_SET_OPTIONS,
  PROGRESSION_FAMILY_OPTIONS,
  SCALE_FAMILY_OPTIONS,
} from '../content/curriculum';
import { countMatchingProgressions, matchingProgressionIds } from '../lib/engine/phraseGenerator';
import type {
  ContentBlockId,
  CurriculumPresetId,
  KeySetId,
  ProgressionFamilyTag,
  RhythmFilterId,
  ScaleFamilyId,
} from '../types/music';
import type { ExerciseConfig, ProgressState } from '../types/progress';

interface PracticeSettingsDrawerProps {
  progress: ProgressState;
  inputMode: 'midi' | 'qwerty';
  potentialPhraseCount: number;
  onClose: () => void;
  onOpenProgress: () => void;
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
  onToggleContentBlock: (contentBlockId: ContentBlockId) => void;
  onToggleScaleFamily: (scaleFamilyId: ScaleFamilyId) => void;
  onToggleProgressionFamily: (progressionFamilyTag: ProgressionFamilyTag) => void;
  onToggleComputerKeyboardAudio: () => void;
  onToggleKeyboardFriendlyVoicings: () => void;
}

const RHYTHM_OPTIONS: Array<{ value: RhythmFilterId; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'block_whole', label: 'Whole Notes' },
  { value: 'quarters', label: 'Quarter Notes' },
  { value: 'charleston', label: 'Charleston' },
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
  potentialPhraseCount,
  onClose,
  onOpenProgress,
  onSelectMode,
  onSelectGuidedFlowMode,
  onSelectCurriculumPreset,
  onSelectKeySet,
  onSelectRhythm,
  onSelectImprovisationProgressionMode,
  onSelectImprovisationAdvanceMode,
  onSetChainMovement,
  onToggleContentBlock,
  onToggleScaleFamily,
  onToggleProgressionFamily,
  onToggleComputerKeyboardAudio,
  onToggleKeyboardFriendlyVoicings,
}: PracticeSettingsDrawerProps) {
  const isImprovisationMode = progress.exerciseConfig.mode === 'improvisation';
  const config = progress.exerciseConfig;
  const selectedKeySet = KEY_SET_OPTIONS.find((option) => option.id === progress.exerciseConfig.keySet) ?? null;
  const unlockedRhythms = useMemo(
    () => [...new Set(Object.values(progress.unlocksByLane).flatMap((unlock) => unlock.rhythms))],
    [progress.unlocksByLane],
  );
  const optionAvailability = useMemo(() => {
    const withConfig = (nextConfig: ExerciseConfig): boolean => countMatchingProgressions(nextConfig) > 0;
    const currentMatches = new Set(matchingProgressionIds(config));
    const toggleArrayItem = <T extends string>(items: T[], item: T): T[] =>
      (items.includes(item) ? items.filter((value) => value !== item) : [...items, item]);
    const addsNewProgressions = (nextConfig: ExerciseConfig): boolean =>
      matchingProgressionIds(nextConfig).some((id) => !currentMatches.has(id));

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
        config.enabledContentBlockIds.includes(block.id)
          ? withConfig({ ...config, enabledContentBlockIds: toggleArrayItem(config.enabledContentBlockIds, block.id) })
          : (() => {
            const nextConfig = {
              ...config,
              enabledContentBlockIds: toggleArrayItem(config.enabledContentBlockIds, block.id),
            };
            return withConfig(nextConfig) && addsNewProgressions(nextConfig);
          })(),
      ])),
      scaleFamilies: Object.fromEntries(SCALE_FAMILY_OPTIONS.map((family) => [
        family.id,
        config.enabledScaleFamilyIds.includes(family.id)
          ? withConfig({ ...config, enabledScaleFamilyIds: toggleArrayItem(config.enabledScaleFamilyIds, family.id) })
          : (() => {
            const nextConfig = {
              ...config,
              enabledScaleFamilyIds: toggleArrayItem(config.enabledScaleFamilyIds, family.id),
            };
            return withConfig(nextConfig) && addsNewProgressions(nextConfig);
          })(),
      ])),
      progressionFamilies: Object.fromEntries(PROGRESSION_FAMILY_OPTIONS.map((family) => [
        family.id,
        config.enabledProgressionFamilyTags.includes(family.id)
          ? withConfig({
            ...config,
            enabledProgressionFamilyTags: toggleArrayItem(config.enabledProgressionFamilyTags, family.id),
          })
          : (() => {
            const nextConfig = {
              ...config,
              enabledProgressionFamilyTags: toggleArrayItem(config.enabledProgressionFamilyTags, family.id),
            };
            return withConfig(nextConfig) && addsNewProgressions(nextConfig);
          })(),
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
              <p>Progress remains local for now. Cloud save will attach here once auth and sync land.</p>
            </div>
          </div>
          <div className="settings-actions">
            <button type="button" onClick={onOpenProgress}>View Progress</button>
          </div>
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
            </div>
          </section>
        )}

        <div className="settings-micro-meta">
          <span className="settings-meta-label">Potential phrases</span>
          <strong>{potentialPhraseCount.toLocaleString()}</strong>
        </div>

        <section className="settings-section">
          <div className="settings-section-copy">
            <h3>Curriculum</h3>
            <p>Choose the current practice block. These presets are the first step toward broader content filtering.</p>
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
            <p>Use the computer keyboard as a first-party input surface when MIDI is not connected.</p>
          </div>
          <div className="settings-toggle-stack">
            <button
              type="button"
              className={`settings-toggle-card ${progress.settings.keyboardFriendlyVoicings ? 'active' : ''}`.trim()}
              disabled={inputMode === 'midi'}
              onClick={onToggleKeyboardFriendlyVoicings}
            >
              <strong>Keyboard Friendly</strong>
              <span>{inputMode === 'qwerty'
                ? 'Keep generated voicings inside the qwerty range from C to G.'
                : 'Connect no MIDI device to enable qwerty-range voicings.'}</span>
            </button>
            <button
              type="button"
              className={`settings-toggle-card ${progress.settings.enableComputerKeyboardAudio && inputMode === 'qwerty' ? 'active' : ''}`.trim()}
              disabled={inputMode !== 'qwerty'}
              onClick={onToggleComputerKeyboardAudio}
            >
              <strong>Computer Audio</strong>
              <span>{inputMode === 'qwerty'
                ? 'Play keyboard notes through the same voice used by reference playback.'
                : 'Connect no MIDI device to enable computer-keyboard audio.'}</span>
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
                disabled={option.value !== 'all' && !unlockedRhythms.includes(option.value)}
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
