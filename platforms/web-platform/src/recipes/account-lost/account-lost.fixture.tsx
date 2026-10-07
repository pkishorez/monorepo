import { AccountLost, type AccountLostUser } from './index';

const ada: AccountLostUser = { id: 'ada', name: 'Ada Lovelace' };
const grace: AccountLostUser = { id: 'grace', name: 'Grace Hopper' };

const noop = () => {};

export default {
  'others signed in': (
    <AccountLost
      lost={ada}
      others={[grace]}
      onSignInAgain={noop}
      onSwitch={noop}
      onSignOut={noop}
    />
  ),
  'nobody else': (
    <AccountLost
      lost={ada}
      others={[]}
      onSignInAgain={noop}
      onSwitch={noop}
      onSignOut={noop}
    />
  ),
};
