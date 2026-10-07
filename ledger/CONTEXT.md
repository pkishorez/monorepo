# Ledger

Ledger: one app that writes down the money you spend and earn and shows where it goes. It is the blueprint for every kstack app: the same Commands run from keys on a desktop and from gestures on a phone.

## Language

### Money

**Entry**:
One movement of money: how much, in or out, what it was for, from which Account, on which day, with a memo.
_Avoid_: transaction, record, item

**Account**:
Where money sits, such as Cash, Bank, Card or Savings. Its balance is every Entry of it, in minus out. The user adds and renames Accounts; an Account is never deleted.
_Avoid_: wallet, source

**Category**:
What money was for, such as Food or Salary, with the Budget it is allowed each month.
_Avoid_: tag, label

**Budget**:
How much a Category may spend in one month. A Category without one has no limit.
_Avoid_: limit, cap

**Month**:
One calendar month of Entries: what came in, what went out, and where it went by Category.
_Avoid_: period, analytics, report

### Users

**User**:
One person signed in to a Backend: with Google on the Remote Backend, by name on the Local Backend. Several Users can be signed in on one device at once; each has their own money, and none sees another's.
_Avoid_: account (an Account is where money sits), profile, login

**Backend**:
What keeps every User's money and knows who they are: the Remote Backend, unless Settings chose the Local Backend. Each has its own Users; changing Backend signs no one out of either.
_Avoid_: mode, server, environment, demo

**Remote Backend**:
The Backend somewhere else, where a User signs in with Google and their money is kept for every device. Ledger starts on it.
_Avoid_: cloud backend, real backend, production

**Local Backend**:
The Backend on this device, where a User signs in by choosing any name and their money never leaves the device. It is chosen to try Ledger out, and is how an agent drives it.
_Avoid_: demo, mock backend, browser backend, sandbox, offline mode

**Session**:
One User signed in on this device. Several can be at once, one of them the Active Session.
_Avoid_: login, account

**Active Session**:
The Session Ledger has open, the same in every tab: its User's copy of their money, kept in step with the Backend. It changes when another User is chosen or this one signs out.
_Avoid_: open session, current user, connection

**Switch User**:
Make another User's Session the Active Session, at once, in every tab, without signing anyone out. Each User's copy of their money stays on the device until that User signs out.
_Avoid_: switch account, change account

**User Switcher**:
What lists every User signed in on this device, to Switch User, Add User, or Sign Out the open User.
_Avoid_: account menu, profile menu

**Add User**:
Signing in one more User straight from the User Switcher: Google asks which of its accounts, or the Local Backend asks for a name, and Ledger comes back to the same Place with that User's Session active. Choosing a User already signed in on this device only switches to them.
_Avoid_: add account, login, sign up

**Sign Out**:
Ending one User on this device: their copy of their money leaves it, and another signed-in User opens, or, with no one left, Ledger is signed out. Signing every User out at once is in Settings and is asked about first.
_Avoid_: log out, remove account

**Manage Google Accounts**:
Going to the shared sign-in service, in a new tab, to see and end the User's Sessions and Grants. It is not how a User is added or signed out.
_Avoid_: sign out, add account

**Splash**:
What shows while Ledger starts on a phone, before any Place: the Ledger mark and name, and at the foot, powered by kstack.
_Avoid_: launch screen, loading screen

### Places

**Place**:
One screen you go to: Home, Entries, an Entry, a Month, or Settings. Add is a sheet over a Place, never a Place.
_Avoid_: page, route, view

**Settings**:
How Ledger looks, sounds and is driven on this device, the same for every User of it: the theme, the Sounds and Haptics, the Keys and Gestures switches with every Command’s key. Also the Place to change them, along with the currency of the User's money and the way to Manage Google Accounts.
_Avoid_: preferences, options

**Section**:
One part of a Place you can Go straight to, such as the Keys tab of Settings. A Section is never a Place of its own.
_Avoid_: tab, sub-place, sub-entry

**Sidebar**:
What is beside every Place: the User Switcher at its top, the Places to Go to, then each Account with its balance. It can be given the keys, and gives them back to where they were. On a touch screen, web or phone, one finger swiping right from anywhere opens it under the finger, unless what is under the finger takes that swipe itself (a Section to turn back to, a row of pills that can still scroll); a swipe left shuts it. Its edge of the screen is its own, open or closed: a swipe from there always moves it and never goes back a page.
_Avoid_: nav, menu, drawer

**Home**:
This Month at a glance: what is left, in against out, the Budgets filling up, and the latest Entries.
_Avoid_: dashboard, overview

**The List**:
The Place that lists the things of the Place you are in, with that thing marked: Entries for an Entry or Home, the Months for a Month.
_Avoid_: index, overview

### Commands

**Command**:
One thing the user tells the app to do, with one key where there is a keyboard and, for most, a gesture where there is a touch screen. Both run the same Action, so a Command works in exactly the same Places either way.
_Avoid_: shortcut, gesture (each is only one way to give a Command)

**Keys** / **Gestures**:
The two ways to give Commands, each switched on or off by the user in Settings. Keys show only where a keyboard is, Gestures only where a touch screen is; a device with both shows both. Finding a Command (Cmd K) works even with Keys off.
_Avoid_: desktop mode, mobile mode

**Key Bar**:
What shows, at the foot of the screen, the keys still to press to finish a Command, that a key finished none, or the Command just given.
_Avoid_: status bar, toast, announcer

**Leader**:
Space, pressed before a letter, for Commands that move the keys rather than the Place: Space E gives the keys to the Sidebar.
_Avoid_: prefix

**Go**:
The Command to move to another Place. The new page shows at once, however Go was given.

**Jump**:
The Command to go to The List of where you are, with where you were marked.
_Avoid_: back, up

**Next / Previous**:
The Commands to move one step through what the Place shows: the next Entry, the next Month.

**Add**:
The Command to write down a new Entry: a key, or the plus button on a touch screen.

**Thumb Lock**:
The left thumb resting still on the screen while another finger moves. It turns the other finger's swipe into a Command, as holding Ctrl turns a key into one: up and down Step through the Places, and sideways moves into and out of Sections. A swipe without it acts on what is under the finger.
_Avoid_: hold, long press, modifier

**Step**:
One row up or down the Place Picker in a Thumb Lock swipe. Each same short stretch of travel from where the finger last moved something is one Step, either way, and so is moving into or out of Sections; turning around counts from where the finger turned, never from where it began. An Entry or a Month counts as just under its list: up from it goes to the list. Past either end it holds there; the order does not wrap.
_Avoid_: next screen, page

**Place Picker**:
What shows, at the top of the screen, from the moment a Thumb Lock swipe first moves, with everything behind it dimmed and blurred: every Place in order, where the swipe began and the one its Steps have reached both marked, and a mark on each Place that has Sections. Moving right opens the marked Place's Sections beside it, with the Places drawn back to the top left; moving left goes back to the Places. Opening a Place's Sections again in the same swipe marks the Section last reached there; otherwise the Section you are on, else the first. Lifting the finger goes to what is marked; coming back to where the swipe began and lifting goes nowhere, and lifting the thumb first calls the swipe off. A Thumb Lock that never moves shows nothing. Nothing shows under the fingers.
_Avoid_: lift hint, place switcher, wheel, menu, launcher

**Gesture Sounds**:
The sounds of the Thumb Lock: soft as it locks and arms, a tick at each Step, a gentle chime when it goes. A Wrong Way makes none. They follow the one Sounds setting, like the sounds of Commands.
_Avoid_: audio feedback

**Gesture Haptics**:
The buzzes of the Thumb Lock on a phone: as it locks, at each Step, and when it goes. A Wrong Way makes none. They follow their own Haptics setting, apart from Sounds, so a User can mute one and keep the other.
_Avoid_: vibration, gesture sounds

**Wrong Way**:
A Thumb Lock swipe sideways where there is nowhere to go: right on a Place with no Sections, or left among the Places. The Place Picker shakes; nothing sounds, and there are no Gesture Haptics.
_Avoid_: error, invalid gesture
