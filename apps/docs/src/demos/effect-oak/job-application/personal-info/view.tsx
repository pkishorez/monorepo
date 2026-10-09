import { View } from 'effect-oak/react';
import { Label } from '@kstackz/web-platform/components/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@kstackz/web-platform/components/native-select';
import { errorOf, TextInput } from '../fields/index.js';
import { emailError, PersonalInfo, PRONOUNS, RULES } from './personal-info.js';

/** Today as `YYYY-MM-DD`, the earliest start date the picker offers. */
const today = () => new Date().toISOString().slice(0, 10);

export const PersonalInfoView = View.make(PersonalInfo, ({ model, send }) => {
  const edit =
    (field: 'firstName' | 'lastName' | 'phone' | 'portfolioUrl') =>
    (value: string) =>
      send({ _tag: 'Edited', field, value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextInput
        id="first-name"
        label="First name"
        value={model.firstName.value}
        error={errorOf(RULES.firstName, model.firstName)}
        onChange={edit('firstName')}
      />
      <TextInput
        id="last-name"
        label="Last name"
        value={model.lastName.value}
        error={errorOf(RULES.lastName, model.lastName)}
        onChange={edit('lastName')}
      />
      <TextInput
        id="email"
        label="Email"
        type="email"
        value={model.email.value}
        error={emailError(model)}
        hint={
          model.emailCheck === 'Checking'
            ? 'Checking…'
            : model.emailCheck === 'Free'
              ? '✓ Available'
              : 'Try test@example.com to see a taken email.'
        }
        onChange={(value) => send({ _tag: 'EditedEmail', value })}
      />
      <TextInput
        id="phone"
        label="Phone (optional)"
        type="tel"
        value={model.phone.value}
        error={errorOf(RULES.phone, model.phone)}
        onChange={edit('phone')}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pronouns">Pronouns (optional)</Label>
        <NativeSelect
          id="pronouns"
          className="w-full"
          value={model.pronoun}
          onChange={(event) =>
            send({ _tag: 'ChosePronoun', pronoun: event.target.value })
          }
        >
          <NativeSelectOption value="">Select pronouns</NativeSelectOption>
          {PRONOUNS.map((pronoun) => (
            <NativeSelectOption key={pronoun} value={pronoun}>
              {pronoun}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {model.pronoun === 'Other' ? (
        <TextInput
          id="custom-pronouns"
          label="Your pronouns"
          value={model.customPronouns}
          onChange={(value) => send({ _tag: 'EditedCustomPronouns', value })}
        />
      ) : (
        <div className="hidden sm:block" />
      )}
      <TextInput
        id="portfolio"
        label="Portfolio URL (optional)"
        type="url"
        placeholder="github.com/you"
        value={model.portfolioUrl.value}
        error={errorOf(RULES.portfolioUrl, model.portfolioUrl)}
        onChange={edit('portfolioUrl')}
      />
      <TextInput
        id="available-date"
        label="Available from (optional)"
        type="date"
        min={today()}
        value={model.availableDate}
        onChange={(date) => send({ _tag: 'ChoseAvailableDate', date })}
      />
    </div>
  );
});
