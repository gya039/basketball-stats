# How the App Works

## Overview
**Basketball Ops for the Titans** is a tablet-first basketball stats and match operations app designed for live, courtside use. It helps team staff record games in real time, manage rosters, review match history, and analyze shot patterns through box scores, logs, and heat maps. The app is built for fast in-game data entry, with an interface optimized for scorekeepers using iPads or Android tablets during live matches. Its primary value is simple: make live stat collection faster, clearer, and more useful for coaches and team staff after the game.

## Who It’s For
- **Primary user: Live scorekeeper / team staff**
  Uses the app during games to track scoring, rebounds, fouls, turnovers, substitutions, and shot locations.
- **Secondary user: Coach or analyst**
  Uses the app before and after games to manage rosters, review box scores, study shot maps, and export team data.

## Core Workflow

### 1. Open the app and load the team setup
When the app launches, the home screen shows the current home team, live match options, and archive actions. The team roster is loaded from the shared backend, so multiple authorized devices can work from the same base roster.

Typical first actions:
- Confirm the home team roster is correct
- Edit players, jersey numbers, coach name, and team colors if needed
- Review any live matches already in progress
- Open previous match history

This lets the team start from a shared source of truth rather than re-entering data on each device.

### 2. Create a new match
From the home screen, the user selects **New Match** to create a game.

The setup flow includes:
- Opponent name
- Match date
- Venue
- Opponent roster
- Opponent colors
- Coach information
- Starting lineups

The app prevents obviously invalid setup data where possible, such as dates in the past for new match creation. Once setup is complete, the match moves into the live game screen.

### 3. Start live tracking during the game
The live screen is the core of the product. It shows:
- Home and away score panels
- Current quarter
- Team fouls
- Player side rails for both teams
- Coach/bench control panels
- Selected player panel
- Quick action buttons
- Interactive court

The scorekeeper records actions in several ways:

#### Court interactions
- **Tap on the court** records a missed shot flow
- **Hold on the court** records a made shot flow

After a shot is initiated, the app asks the scorekeeper to:
- Choose shot type (`2PT`, `3PT`, or `DUNK` for made shots)
- Select the player
- Continue with follow-up logic such as assist, rebound, block, or dead ball

This makes shot entry feel faster and more natural than traditional menu-only stat entry.

#### Quick actions
The scorekeeper can also use action buttons for:
- Rebound
- Foul
- Turnover

These actions open simplified guided flows so the user can assign the event to the correct player and record the correct subtype when relevant.

### 4. Handle advanced basketball logic
The app supports more detailed basketball stat logic than a simple scoreboard.

Examples include:
- Technical fouls for player, coach, or bench
- Offensive, personal, unsportsmanlike, and disqualifying foul paths
- Coach ejection after three coach/bench technicals
- Player ejection after disqualifying fouls, two unsportsmanlikes, or foul-out
- Turnover categories:
  - Passing
  - Ball Handling
  - Violation
  - Offensive Foul
- Violation details:
  - Travel
  - Double Dribble
  - 3 Seconds
  - 5 Seconds
  - 8 Seconds
  - 24 Seconds
  - Backcourt
  - Out Of Bounds

The system is designed to align with a FIBA-style (International Basketball Federation) workflow suitable for Basketball Ireland competition use.

### 5. Review quarter summaries and live overlays
At the end of each quarter, the scorekeeper taps **Quarter Over**. This opens a summary flow before moving on.

From there, the user can review:
- Quarter summary
- Live Log
- Box Score
- Shot Map

These overlays help staff check the game state without leaving the live match. The app is designed so these views sit inside the live flow rather than feeling like a separate screen.

### 6. Finish the match
When the game is complete, the user selects **End Match**. The app only allows this in the final quarter, which helps prevent accidental early closure.

Once ended:
- The match is saved to history
- Final stats remain available in the archive
- Shot maps and player performance are preserved
- Match data becomes part of the team’s broader season record

### 7. Review, analyze, and export
After the game, staff can open **Previous Matches** and review:
- Event logs
- Box scores
- Shot maps
- Player heat maps

The app also supports exports:
- **JSON export** for full backup and restore-style use
- **CSV export** for season stats, coach review, or spreadsheet analysis

This creates a feedback loop from live data collection to postgame learning and long-term tracking.

## Key Concepts & Objects

### Team
A team includes its name, colors, coach, and roster. The app supports a persistent home team and match-specific opponent teams.

### Player
A player has a name, number, and stat line. Players can be on court, on the bench, selected for focus, or involved in events like shots, fouls, rebounds, assists, steals, and blocks.

### Match
A match is the central record for one game. It stores teams, lineups, score state, quarter state, status, and summary data.

### Match Event
A match event is a single recorded action, such as:
- Made shot
- Missed shot
- Assist
- Rebound
- Block
- Steal
- Turnover
- Foul
- Free throw
- Substitution

These events power the live log, the box score, and the analytics views.

### Live Log
The live log is the chronological record of game actions in readable language.

### Box Score
The box score aggregates player and team stats into a familiar basketball summary table.

### Shot Map / Heat Map
A shot map visualizes where shots happened. Heat maps combine shot locations over time to show zones of volume and results.

## Behind the Scenes (Simple Architecture)

### Client
The app runs as a web app optimized for tablets. It behaves like an installable home-screen app on devices such as iPads and Android tablets.

### Backend
The backend uses **Supabase**, which provides:
- Database storage
- Shared live data between devices
- Real-time updates for active matches

### Database
The main stored objects are:
- Teams
- Players
- Matches
- Match events

This allows both live syncing and historical reporting.

### Hosting
**Assumption:** The app is deployed through a service like Netlify or Vercel for easy device access via browser or home-screen install.

### Analytics Layer
The shot map and heat map features are built from stored shot-location events. These locations are normalized so the visualizations can be rendered consistently across devices and match contexts.

## Edge Cases & Error Handling
- If two devices open the same live match, the app is designed to share data, but best practice is still one scoring device at a time.
- If a player fouls out or is disqualified, the app forces or strongly guides substitution logic.
- If a coach or bench accumulates enough technical fouls, the app records ejection thresholds.
- If a missed shot is blocked, the flow ends with the block assignment and does not incorrectly continue into rebound logic.
- If a player has no tracked shots, their heat map shows an empty state rather than broken visuals.
- If data is stale on one device, real-time syncing or manual refresh should restore current state.
- If a match setup field is invalid or incomplete, the app blocks progression until required data is entered.
- If a device browser tries to trigger text selection or long-press menus during gameplay, the app suppresses those behaviors where possible to protect live input.

## Permissions & Roles
**Assumption:** The current version does not use full account-based role management.

Practical roles today:
- **Scorekeeper:** records live events and controls active matches
- **Coach/Analyst:** reviews data, box scores, and exports
- **Admin/Team manager:** manages roster and team setup

Because the app is designed for a trusted team environment, role boundaries are operational rather than heavily enforced in-app.

## Data & Privacy

### Stored data
The app stores:
- Team information
- Player roster data
- Coach name
- Match setup details
- Live match state
- Match event history
- Shot locations for shot maps and heat maps

### Not stored
**Assumption:** No payment information or personal identity verification data is stored in the app.

### Retention
Match data is retained to support historical review, season tracking, exports, and team analysis. Export tools provide a basic backup path for operational safety.

## FAQ

### 1. Is this a scoreboard app or a stats app?
It is both. It tracks live score state and also records detailed stat events for later analysis.

### 2. Can multiple devices use it?
Yes, multiple devices can access the same shared data, but one live scoring device at a time is the safest workflow.

### 3. Can coaches review games afterward?
Yes. Previous matches include logs, box scores, and shot-map analysis.

### 4. Does it support shot-location tracking?
Yes. Made and missed shots can be placed on the court and later reviewed in heat maps.

### 5. Can it handle coach and bench fouls?
Yes. Coach and bench technicals are supported separately from normal player foul tracking.

### 6. Can players foul out or be ejected?
Yes. The app supports foul-out, disqualifying foul ejection, and repeated unsportsmanlike foul ejection logic.

### 7. Can data be exported?
Yes. JSON is used for full backup-style export, and CSV is available for season stat export.

### 8. Does it work on tablets?
Yes. The app is designed around tablet use, especially during live games.

### 9. Does it need internet?
**Assumption:** Internet is required for shared live syncing and backend access, unless a future offline fallback is added.

## Glossary
- **AST:** Assist
- **BLK:** Block
- **STL:** Steal
- **PF:** Personal Fouls
- **2PT / 3PT:** Two-point or three-point field goal attempt
- **DUNK:** A made two-point shot recorded specifically as a dunk
- **Live Log:** A chronological text feed of match events
- **Box Score:** A structured stat summary by player and team
- **Heat Map:** A visual overlay showing where shots occurred and how successful they were
