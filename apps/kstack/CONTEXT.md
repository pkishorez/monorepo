# kstack

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

### Places

**Place**:
One screen you go to: Home, Entries, an Entry, a Month, or Settings. Add is a sheet over a Place, never a Place.
_Avoid_: page, route, view

**Settings**:
The Place for how Ledger looks, sounds and is driven: the theme, the currency, the Keys and Gestures switches with every Command's key, the user's money, and signing out.
_Avoid_: preferences screen, options

**Sidebar**:
What is beside every Place: the Places to Go to, then each Account with its balance. It can be given the keys, and gives them back to where they were.
_Avoid_: nav, menu, drawer

**Home**:
This Month at a glance: what is left, in against out, the Budgets filling up, and the latest Entries.
_Avoid_: dashboard, overview

**The List**:
The Place that lists the things of the Place you are in, with that thing marked: Entries for an Entry or Home, the Months for a Month.
_Avoid_: index, overview

### Commands

**Command**:
One thing the user tells the app to do, with one key where there is a keyboard and one gesture where there is a touch screen. Both run the same Action, so a Command works in exactly the same Places either way.
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
The Command to move to another Place.

**Jump**:
The Command to go to The List of where you are, with where you were marked.
_Avoid_: back, up

**Next / Previous**:
The Commands to move one step through what the Place shows: the next Entry, the next Month.

**Add**:
The Command to write down a new Entry.

**Thumb Lock**:
The left thumb resting still on the screen while another finger moves. It turns the other finger's swipe into a Command, as holding Ctrl turns a key into one. A swipe without it acts on what is under the finger.
_Avoid_: hold, long press, modifier

**Compass**:
What quietly shows the Commands of a Thumb Lock under the moving finger: a small label for each way that does something in this Place, named for its Command, and none for a way that doesn't. The label being swiped toward brightens as the finger goes, zooms in once armed, and settles back if the finger comes back short.
_Avoid_: wheel, radial menu, HUD

**Gesture Sounds**:
The sounds of the Thumb Lock, switched on or off apart from the sounds of Commands: soft as it locks and arms, a gentle chime when its Command runs, an error on a Wrong Way.
_Avoid_: haptics, audio feedback

**Wrong Way**:
A Thumb Lock swipe toward a way with no label on the Compass: the whole screen shakes, an error sounds if Gesture Sounds are on, and the phone buzzes where it can.
_Avoid_: error, invalid gesture
