import { defineQuery } from 'bitecs'
import { Position, Building, Renderable } from '../ecs/components'
import { world } from '../ecs/world'

const buildingQuery = defineQuery([Building, Position])

class Node {
  x: number
  y: number
  f: number = 0
  g: number = 0
  h: number = 0
  parent: Node | null = null
  walkable: boolean = true

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }
}

export class Grid {
  nodes: Node[][]
  width: number
  height: number

  constructor(width: number, height: number) {
    console.log(`Creating grid with width: ${width}, height: ${height}`);
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid grid dimensions: width=${width}, height=${height}`);
    }
    this.width = width;
    this.height = height;
    this.nodes = [];

    for (let y = 0; y < height; y++) {
      this.nodes[y] = [];
      for (let x = 0; x < width; x++) {
        this.nodes[y][x] = new Node(x, y);
      }
    }
    console.log(`Grid created successfully`);
  }

  getNode(x: number, y: number): Node | null {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null
    }
    return this.nodes[y][x]
  }

  setWalkable(x: number, y: number, walkable: boolean) {
    const node = this.getNode(x, y)
    if (node) {
      node.walkable = walkable
    }
  }

  updateFromWorld() {
    console.log('Updating pathfinding grid from world')
    // Reset all nodes to walkable
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.nodes[y][x].walkable = true
      }
    }

    // Set completed buildings as non-walkable
    const buildings = buildingQuery(world)
    console.log(`Found ${buildings.length} buildings`)
    for (let i = 0; i < buildings.length; i++) {
      const building = buildings[i]
      if (Renderable.type[building] === 3) { // Only for completed buildings
        const x = Math.floor(Position.x[building] / 15)
        const y = Math.floor(Position.y[building] / 15)
        this.setWalkable(x, y, false)
        console.log(`Set completed building at (${x}, ${y}) as non-walkable`)
      }
    }
  }
}

function manhattan(a: Node, b: Node): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

export function findPath(grid: Grid, startX: number, startY: number, endX: number, endY: number): Node[] | null {
  console.log(`Finding path from (${startX}, ${startY}) to (${endX}, ${endY})`);
  console.log(`Grid dimensions: ${grid.width}x${grid.height}`);

  if (startX < 0 || startX >= grid.width || startY < 0 || startY >= grid.height ||
      endX < 0 || endX >= grid.width || endY < 0 || endY >= grid.height) {
    console.error(`Start or end position out of grid bounds`);
    return null;
  }

  const start = grid.getNode(startX, startY);
  const end = grid.getNode(endX, endY);

  if (!start || !end) {
    console.error(`Start or end node is null`);
    return null;
  }

  console.log(`Start node walkable: ${start.walkable}, End node walkable: ${end.walkable}`);

  if (!start.walkable || !end.walkable) {
    console.log(`Path not possible: start or end is not walkable`);
    return null;
  }

  const openSet = new Set<Node>([start]);
  const closedSet = new Set<Node>();

  start.g = 0;
  start.f = manhattan(start, end);

  while (openSet.size > 0) {
    let current = Array.from(openSet).reduce((a, b) => a.f < b.f ? a : b);

    if (current === end) {
      let path = [];
      while (current) {
        path.unshift(current);
        current = current.parent;
      }
      console.log(`Path found with ${path.length} nodes`);
      return path;
    }

    openSet.delete(current);
    closedSet.add(current);

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        if (x === 0 && y === 0) continue;
        const neighbor = grid.getNode(current.x + x, current.y + y);
        if (!neighbor || !neighbor.walkable || closedSet.has(neighbor)) continue;

        const tentativeG = current.g + 1;

        if (!openSet.has(neighbor)) {
          openSet.add(neighbor);
        } else if (tentativeG >= neighbor.g) {
          continue;
        }

        neighbor.parent = current;
        neighbor.g = tentativeG;
        neighbor.f = neighbor.g + manhattan(neighbor, end);
      }
    }
  }

  console.log(`No path found after exploring ${closedSet.size} nodes`);
  return null;
}