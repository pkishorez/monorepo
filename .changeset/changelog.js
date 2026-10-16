import github from '@changesets/changelog-github';

/*
 * The GitHub changelog, with every one of the maintainer's accounts
 * thanked as the one the packages are published under, so a release
 * never thanks a second account of the same person.
 */

const ALIASES = { kishorenuma: 'pkishorez' };

const credit = (line) =>
  Object.entries(ALIASES).reduce(
    (text, [alias, name]) =>
      text.replaceAll(
        `[@${alias}](https://github.com/${alias})`,
        `[@${name}](https://github.com/${name})`,
      ),
    line,
  );

export default {
  getReleaseLine: async (...args) =>
    credit(await github.getReleaseLine(...args)),
  getDependencyReleaseLine: github.getDependencyReleaseLine,
};
