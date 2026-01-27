export type Team = '0' | '1';
export type UnitType = 'champion' | 'minion';

export interface Position {
  x: number;
  y: number;
}

export interface Unit {
  id: string;
  type: UnitType;
  hp: number;
  maxHp: number;
  attack: number;
  range: number;
  pos: Position;
  team: Team;
}

export interface Tower {
  id: string;
  hp: number;
  maxHp: number;
  pos: Position;
  team: Team;
}

export type OrderType = 'move' | 'attack';

export interface Order {
  sourceUnitId: string;
  type: OrderType;
  targetPos?: Position;
  targetUnitId?: string;
}

export interface GameState {
  units: Unit[];
  towers: Tower[];
  orders: Record<string, Order[]>;
  turnLog: string[];
  turnResolved: boolean;
}
