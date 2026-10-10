import { View } from 'effect-oak/react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@kstackz/web-platform/components/button';
import { STEPS, stepAfter, stepLabel } from './application/index.js';
import { AttachmentsView } from './attachments/index.js';
import { isComplete, needingAttention } from './attention.js';
import { CoverLetterView } from './cover-letter/index.js';
import { JobApplication } from './job-application.js';
import { PersonalInfoView } from './personal-info/index.js';
import { Preview } from './preview/index.js';
import { Review } from './review/index.js';
import { SkillsView } from './skills/index.js';
import { StepNav } from './step-nav/index.js';
import { WorkHistoryView } from './work-history/index.js';

/*
 * The page: the step nav, the current step, and the live preview, side by
 * side when the demo is wide enough (container queries, since the Shell's
 * Message Log takes part of the screen). Only the current step's Child is
 * drawn; the others keep their Models while hidden.
 */

export const JobApplicationView = View.make(
  JobApplication,
  ({ model, children, send }) => {
    const attention = needingAttention(model);
    const { step } = model;
    return (
      <div className="@container size-full overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl">
          <header className="mb-6">
            <h1 className="text-2xl font-bold">Apply to Work on Effect Oak</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Fill out the form below and watch your resume build in real time.
            </p>
          </header>
          <div className="flex flex-col gap-8 @3xl:flex-row">
            <div className="shrink-0 @3xl:w-52">
              <div className="sticky top-0">
                <StepNav
                  current={step}
                  attention={attention}
                  onChoose={(step) => send({ _tag: 'ChoseStep', step })}
                />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="mb-6 text-lg font-semibold">{stepLabel[step]}</h2>
              <div className="min-h-[400px]">
                {step === 'PersonalInfo' && (
                  <PersonalInfoView node={children.personalInfo} />
                )}
                {step === 'WorkHistory' && (
                  <WorkHistoryView node={children.workHistory} />
                )}
                {step === 'Skills' && <SkillsView node={children.skills} />}
                {step === 'CoverLetter' && (
                  <CoverLetterView node={children.coverLetter} />
                )}
                {step === 'Attachments' && (
                  <AttachmentsView node={children.attachments} />
                )}
                {step === 'Review' && (
                  <Review
                    sheet={model.sheet}
                    submission={model.submission}
                    blocked={
                      model.submitAttempted && !isComplete(model.sheet)
                        ? attention
                        : null
                    }
                    onSubmit={() => send({ _tag: 'ClickedSubmit' })}
                  />
                )}
              </div>
              {step !== 'Review' && (
                <div className="mt-8 flex justify-between border-t pt-6">
                  {step === STEPS[0] ? (
                    <span />
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => send({ _tag: 'ClickedPrevious' })}
                    >
                      <ArrowLeft /> {stepLabel[stepAfter(step, -1)]}
                    </Button>
                  )}
                  <Button onClick={() => send({ _tag: 'ClickedNext' })}>
                    {stepLabel[stepAfter(step, 1)]} <ArrowRight />
                  </Button>
                </div>
              )}
            </div>
            <aside className="hidden w-72 shrink-0 @5xl:block">
              <div className="sticky top-0">
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                  Live Preview
                </h2>
                <div className="rounded-xl border bg-card p-6 shadow-sm">
                  <Preview sheet={model.sheet} />
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  },
);
