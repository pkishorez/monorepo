import latin from '@fontsource/google-sans/files/google-sans-latin-500-normal.woff2?url';
import type { ButtonHTMLAttributes } from 'react';

/*
 * Google's own "Sign in with Google" button, drawn as its branding
 * guidelines say (developers.google.com/identity/branding-guidelines): the
 * GSI material button, 40px tall, 12px either side, the 20px "G" 10px from
 * the words, Google Sans Medium 14/20, Google's fill, stroke and text
 * colours, 4px corners. The "G" is Google's, unaltered.
 *
 * Google Sans is declared here, in the button's own `<style>`, under a name
 * no app uses, so the browser fetches it only on a page that draws the
 * button. Its file is imported `?url`: the app's bundler ships it and gives
 * it its URL. One installed on the computer is used instead. The three
 * labels are plain Latin, so the Latin file is the only one.
 */

/** `auto` follows the page: dark under `.dark` or `data-theme="dark"`, else light. */
export type GoogleButtonTheme = 'light' | 'dark' | 'auto';

/** The only words Google's branding guidelines allow on the button. */
export type GoogleButtonLabel =
  | 'Sign in with Google'
  | 'Continue with Google'
  | 'Sign up with Google';

export interface GoogleButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  theme?: GoogleButtonTheme;
  label?: GoogleButtonLabel;
}

const css = `
  @font-face {
    font-family: 'Google Button Sans';
    font-style: normal;
    font-weight: 500;
    font-display: swap;
    src: local('Google Sans Medium'), local('GoogleSans-Medium'), url(${latin}) format('woff2');
  }

  .gsi-material-button {
    -moz-user-select: none;
    -webkit-user-select: none;
    -ms-user-select: none;
    -webkit-appearance: none;
    background-image: none;
    border: 1px solid #747775;
    -webkit-border-radius: 4px;
    border-radius: 4px;
    -webkit-box-sizing: border-box;
    box-sizing: border-box;
    cursor: pointer;
    font-family: 'Google Button Sans', arial, sans-serif;
    font-size: 14px;
    letter-spacing: 0.25px;
    outline: none;
    overflow: hidden;
    padding: 0 12px;
    position: relative;
    text-align: center;
    -webkit-transition: background-color .218s, border-color .218s, box-shadow .218s;
    transition: background-color .218s, border-color .218s, box-shadow .218s;
    vertical-align: middle;
    white-space: nowrap;
    min-width: 183px;
    max-width: 400px;
    height: 40px;
  }

  .gsi-material-button--light,
  .gsi-material-button--auto {
    background-color: white;
    color: #1f1f1f;
  }

  .gsi-material-button--dark,
  .dark .gsi-material-button--auto,
  [data-theme='dark'] .gsi-material-button--auto {
    background-color: #131314;
    color: #e3e3e3;
    border-color: #8e918f;
  }

  .gsi-material-button .gsi-material-button-icon {
    height: 20px;
    margin-right: 10px;
    min-width: 20px;
    width: 20px;
  }

  .gsi-material-button .gsi-material-button-content-wrapper {
    -webkit-align-items: center;
    align-items: center;
    display: flex;
    -webkit-flex-direction: row;
    flex-direction: row;
    -webkit-flex-wrap: nowrap;
    flex-wrap: nowrap;
    height: 100%;
    justify-content: space-between;
    position: relative;
    width: 100%;
  }

  .gsi-material-button .gsi-material-button-contents {
    -webkit-flex-grow: 1;
    flex-grow: 1;
    font-family: 'Google Button Sans', arial, sans-serif;
    font-weight: 500;
    line-height: 20px;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: top;
  }

  .gsi-material-button .gsi-material-button-state {
    -webkit-transition: opacity .218s;
    transition: opacity .218s;
    bottom: 0;
    left: 0;
    opacity: 0;
    position: absolute;
    right: 0;
    top: 0;
  }

  .gsi-material-button--light:disabled,
  .gsi-material-button--auto:disabled {
    cursor: default;
    background-color: #ffffff61;
    border-color: #1f1f1f1f;
  }

  .gsi-material-button--dark:disabled,
  .dark .gsi-material-button--auto:disabled,
  [data-theme='dark'] .gsi-material-button--auto:disabled {
    cursor: default;
    background-color: #13131461;
    border-color: #8e918f1f;
  }

  .gsi-material-button--dark:disabled .gsi-material-button-state,
  .dark .gsi-material-button--auto:disabled .gsi-material-button-state,
  [data-theme='dark'] .gsi-material-button--auto:disabled .gsi-material-button-state {
    background-color: #e3e3e31f;
  }

  .gsi-material-button:disabled .gsi-material-button-contents {
    opacity: 38%;
  }

  .gsi-material-button:disabled .gsi-material-button-icon {
    opacity: 38%;
  }

  .gsi-material-button--light:not(:disabled):active .gsi-material-button-state,
  .gsi-material-button--light:not(:disabled):focus .gsi-material-button-state,
  .gsi-material-button--auto:not(:disabled):active .gsi-material-button-state,
  .gsi-material-button--auto:not(:disabled):focus .gsi-material-button-state {
    background-color: #303030;
    opacity: 12%;
  }

  .gsi-material-button--dark:not(:disabled):active .gsi-material-button-state,
  .gsi-material-button--dark:not(:disabled):focus .gsi-material-button-state,
  .dark .gsi-material-button--auto:not(:disabled):active .gsi-material-button-state,
  .dark .gsi-material-button--auto:not(:disabled):focus .gsi-material-button-state,
  [data-theme='dark'] .gsi-material-button--auto:not(:disabled):active .gsi-material-button-state,
  [data-theme='dark'] .gsi-material-button--auto:not(:disabled):focus .gsi-material-button-state {
    background-color: white;
    opacity: 12%;
  }

  .gsi-material-button:not(:disabled):hover {
    -webkit-box-shadow: 0 1px 2px 0 rgba(60, 64, 67, .30), 0 1px 3px 1px rgba(60, 64, 67, .15);
    box-shadow: 0 1px 2px 0 rgba(60, 64, 67, .30), 0 1px 3px 1px rgba(60, 64, 67, .15);
  }

  .gsi-material-button--light:not(:disabled):hover .gsi-material-button-state,
  .gsi-material-button--auto:not(:disabled):hover .gsi-material-button-state {
    background-color: #303030;
    opacity: 8%;
  }

  .gsi-material-button--dark:not(:disabled):hover .gsi-material-button-state,
  .dark .gsi-material-button--auto:not(:disabled):hover .gsi-material-button-state,
  [data-theme='dark'] .gsi-material-button--auto:not(:disabled):hover .gsi-material-button-state {
    background-color: white;
    opacity: 8%;
  }
`;

const GoogleIcon = () => (
  <svg
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 48 48"
    aria-hidden="true"
    style={{ display: 'block' }}
  >
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
    <path fill="none" d="M0 0h48v48H0z" />
  </svg>
);

/**
 * Google's own "Sign in with Google" button, as its branding guidelines draw
 * it. It has no busy look: while the page leaves for Google, disable it and
 * say so beside it. Place it with `className`; it sets no margin or width.
 */
export function GoogleButton({
  theme = 'light',
  label = 'Sign in with Google',
  className,
  ...props
}: GoogleButtonProps) {
  return (
    <>
      <style>{css}</style>
      <button
        type="button"
        {...props}
        className={`gsi-material-button gsi-material-button--${theme} ${className ?? ''}`}
      >
        <div className="gsi-material-button-state" />
        <div className="gsi-material-button-content-wrapper">
          <div className="gsi-material-button-icon">
            <GoogleIcon />
          </div>
          <span className="gsi-material-button-contents">{label}</span>
        </div>
      </button>
    </>
  );
}
