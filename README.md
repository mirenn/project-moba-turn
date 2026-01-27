# LoL Board Game MVP

A turn-based strategy board game inspired by League of Legends, featuring simultaneous turns and automated resolution.

## How to Play

### Objective
Destroy all enemy Towers to win the game.

### Teams
- **Blue Team (Player 0)**: Starts at the Bottom-Left.
- **Red Team (Player 1)**: Starts at the Top-Right (Controlled by CPU in Single Player).

### Turn Structure
The game uses a **Simultaneous Action System**:
1.  **Planning Phase**: You select your Champion and plan your order (Move or Attack). The CPU plans simultaneously.
2.  **Commit Turn**: Once ready, click "Commit Turn".
3.  **Execution Phase**: Orders are resolved simultaneously.
    -   Movements happen first.
    -   Attacks happen second.
    -   Minions and Towers act automatically.

### Units
-   **Champions**: Controlled by the player. High HP and Attack.
-   **Minions**: Automated units that push lanes.
-   **Towers**: Stationary defensive structures with high HP and Attack.

### Mechanics
-   **Movement**: Move 1 square orthogonally or diagonally per turn.
-   **Attack**: Attack enemies within range.
-   **Critical Hits**: Champions have a **20% chance** to deal Double Damage on attacks!

## Controls
-   **Select Unit**: Click on your Champion.
-   **Move**: Click on an empty adjacent cell.
-   **Attack**: Click on an enemy unit in range (indicated by red highlight).
-   **Commit**: Click the "Commit Turn" button to finalize your move.

## Setup
-   **Board**: 5x5 Grid.
-   **Layout**: Bases are located at diagonal corners with towers protecting the front.
