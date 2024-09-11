import * as Phaser from 'phaser'
import * as bitecs from 'bitecs'
import { world } from '../ecs/world'
import { Position, Citizen, Job, JobQueue, NextJob, Renderable, Building } from '../ecs/components'
import { 
  createMovementSystem, 
  hungerSystem, 
  jobSchedulingSystem, 
  jobCompletionSystem, 
  createRenderSystem, 
  createPathRenderSystem,
  createStatusDisplaySystem,
  createBuildingModeSystem
} from '../ecs/systems'
import { Grid, findPath } from '../utils/pathfinding'

export class Game extends Phaser.Scene {
  private renderSystem: () => void
  private pathRenderSystem: () => void
  private statusDisplaySystem: () => void  // Add this line
  private jobQueue: number
  private foodBuilding: number
  private buildingModeSystem: () => void
  private buildingMode: boolean = false
  private grid: Phaser.GameObjects.Grid
  private placementIndicator: Phaser.GameObjects.Rectangle
  private buildButtons: Phaser.GameObjects.Rectangle[]
  private selectedBuildingType: number = 0 // 0: House, 1: Mill, 2: Warehouse
  private buildingColors: number[] = [0x00FF00, 0xFFFF00, 0xFFA500] // Green, Yellow, Orange
  private gridWidth: number = 800
  private gridHeight: number = 600
  private pathfindingGrid: Grid
  private movementSystem: (dt: number) => void

  constructor() {
    super({ key: 'Game' })
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000')

    // Create citizens
    this.createCitizen(200, 300)
    this.createCitizen(600, 300)

    // Create food building
    this.foodBuilding = this.createFoodBuilding(512, 384) // Center of the screen

    this.renderSystem = createRenderSystem(this)
    this.pathRenderSystem = createPathRenderSystem(this)
    this.statusDisplaySystem = createStatusDisplaySystem(this)  // Add this line
    this.buildingModeSystem = createBuildingModeSystem(this)

    // Update the grid creation to use the class properties
    this.grid = this.add.grid(0, 0, this.gridWidth, this.gridHeight, 15, 15, 0x000000, 0, 0xffffff, 0.2)
      .setOrigin(0, 0)
      .setVisible(false)

    // Create placement indicator (initially hidden)
    this.placementIndicator = this.add.rectangle(0, 0, 15, 15, this.buildingColors[0], 0.5)
      .setOrigin(0, 0)
      .setVisible(false)

    // Create build buttons
    this.createBuildButtons()

    // Add key listener for toggling building mode
    this.input.keyboard.on('keydown-B', this.toggleBuildingMode, this)

    // Add mouse move listener for updating placement indicator
    this.input.on('pointermove', this.updatePlacementIndicator, this)

    // Update the click event listener
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.buildingMode && this.isInsideGrid(pointer.x, pointer.y)) {
        const x = Math.floor(pointer.x / 15) * 15
        const y = Math.floor(pointer.y / 15) * 15
        this.createBuildingJob(x, y, this.selectedBuildingType)
      } else if (!this.buildingMode) {
        this.createJob(pointer.x, pointer.y)
      }
    })

    // Initialize the pathfinding grid
    const gridWidth = Math.floor(this.gridWidth / 15);
    const gridHeight = Math.floor(this.gridHeight / 15);
    console.log(`Initializing pathfinding grid: ${gridWidth}x${gridHeight}`);
    this.pathfindingGrid = new Grid(gridWidth, gridHeight);

    this.movementSystem = createMovementSystem(this)
  }

  update(time: number, delta: number) {
    this.movementSystem(delta / 1000)
    hungerSystem(delta / 1000)
    jobSchedulingSystem()
    const completedBuildingJobs = jobCompletionSystem()
    this.processCompletedBuildingJobs(completedBuildingJobs)
    this.pathRenderSystem()
    this.statusDisplaySystem()
    this.buildingModeSystem()
    this.renderSystem()
  }

  private processCompletedBuildingJobs(completedJobs: number[]) {
    for (const job of completedJobs) {
      const x = Position.x[job]
      const y = Position.y[job]
      const buildingType = Building.type[job]
      
      this.createBuilding(x, y, buildingType)
      console.log(`Building created at (${x}, ${y}) of type ${buildingType}`)
      
      // Remove the completed job entity
      bitecs.removeEntity(world, job)
    }
  }

  private createCitizen(x: number, y: number) {
    const citizen = bitecs.addEntity(world)
    bitecs.addComponent(world, Position, citizen)
    bitecs.addComponent(world, Citizen, citizen)
    bitecs.addComponent(world, Renderable, citizen)
    Position.x[citizen] = x
    Position.y[citizen] = y
    Citizen.hunger[citizen] = 0
    Citizen.energy[citizen] = 100
    Renderable.type[citizen] = 0
  }

  private createJob(x: number, y: number) {
    const job = bitecs.addEntity(world)
    bitecs.addComponent(world, Job, job)
    bitecs.addComponent(world, Position, job)
    bitecs.addComponent(world, Renderable, job)
    Job.type[job] = Math.floor(Math.random() * 3)
    Job.priority[job] = Math.floor(Math.random() * 10)
    Job.progress[job] = 0
    Job.assignedTo[job] = 0
    Position.x[job] = x // Remove the 7.5 offset
    Position.y[job] = y // Remove the 7.5 offset
    Renderable.type[job] = 1
  }

  private createFoodBuilding(x: number, y: number) {
    const building = bitecs.addEntity(world)
    bitecs.addComponent(world, Position, building)
    bitecs.addComponent(world, Building, building)
    bitecs.addComponent(world, Renderable, building)
    Position.x[building] = x
    Position.y[building] = y
    Building.type[building] = 0 // Food building
    Renderable.type[building] = 2 // New type for building
    return building
  }

  private toggleBuildingMode() {
    this.buildingMode = !this.buildingMode
    this.grid.setVisible(this.buildingMode)
    this.placementIndicator.setVisible(this.buildingMode)
    this.buildButtons.forEach(button => button.setVisible(this.buildingMode))
  }

  private updatePlacementIndicator(pointer: Phaser.Input.Pointer) {
    if (this.buildingMode && this.isInsideGrid(pointer.x, pointer.y)) {
      const x = Math.floor(pointer.x / 15) * 15
      const y = Math.floor(pointer.y / 15) * 15
      this.placementIndicator.setPosition(x, y)
      this.placementIndicator.setVisible(true)
    } else {
      this.placementIndicator.setVisible(false)
    }
  }

  private createBuildButtons() {
    this.buildButtons = []
    const buttonWidth = 50
    const buttonHeight = 50
    const buttonSpacing = 10
    const startY = 100

    for (let i = 0; i < 3; i++) {
      const button = this.add.rectangle(
        this.cameras.main.width - buttonWidth / 2 - 10,
        startY + i * (buttonHeight + buttonSpacing),
        buttonWidth,
        buttonHeight,
        this.buildingColors[i]
      )
        .setInteractive()
        .on('pointerdown', () => this.selectBuildingType(i))
        .setVisible(false)

      this.buildButtons.push(button)
    }

    this.selectBuildingType(0) // Select house by default
  }

  private selectBuildingType(index: number) {
    this.selectedBuildingType = index
    this.buildButtons.forEach((button, i) => {
      button.setStrokeStyle(i === index ? 3 : 0, 0xFFFFFF)
    })
    this.placementIndicator.setFillStyle(this.buildingColors[index])
  }

  private createBuildingJob(x: number, y: number, buildingType: number) {
    const job = bitecs.addEntity(world)
    bitecs.addComponent(world, Job, job)
    bitecs.addComponent(world, Position, job)
    bitecs.addComponent(world, Renderable, job)
    bitecs.addComponent(world, Building, job)
    Job.type[job] = 3 // Use 3 as the type for all building jobs
    Job.priority[job] = 5 // Medium priority
    Job.progress[job] = 0
    Job.assignedTo[job] = 0
    Position.x[job] = x
    Position.y[job] = y
    Renderable.type[job] = 1
    Building.type[job] = buildingType // This is where we set the specific building type

    console.log(`Building job entity created: ${job}, type: ${Job.type[job]}, progress: ${Job.progress[job]}, position: (${x}, ${y}), building type: ${buildingType}`)

    // Add job to queue
    if (JobQueue.size[this.jobQueue] === 0) {
      JobQueue.head[this.jobQueue] = job
      JobQueue.tail[this.jobQueue] = job
      NextJob.nextJobId[this.jobQueue] = job
    } else {
      const currentTail = JobQueue.tail[this.jobQueue]
      NextJob.nextJobId[currentTail] = job
      JobQueue.tail[this.jobQueue] = job
    }
    JobQueue.size[this.jobQueue]++

    console.log(`Job queue updated: size=${JobQueue.size[this.jobQueue]}, head=${JobQueue.head[this.jobQueue]}, tail=${JobQueue.tail[this.jobQueue]}`)
  }

  private createBuilding(x: number, y: number, buildingType: number) {
    console.log(`Creating building at (${x}, ${y}) of type ${buildingType}`)
    const building = bitecs.addEntity(world)
    bitecs.addComponent(world, Position, building)
    bitecs.addComponent(world, Building, building)
    bitecs.addComponent(world, Renderable, building)
    Position.x[building] = x
    Position.y[building] = y
    Building.type[building] = buildingType
    Renderable.type[building] = 3 // New type for completed buildings
    console.log(`Building entity created: ${building} at (${x}, ${y}) of type ${buildingType}`)

    // Update the pathfinding grid only for completed buildings
    this.pathfindingGrid.setWalkable(Math.floor(x / 15), Math.floor(y / 15), false)
    console.log(`Set completed building at (${Math.floor(x / 15)}, ${Math.floor(y / 15)}) as non-walkable`)
  }

  private createRenderSystem = (scene: Phaser.Scene) => {
    const rectangles: Map<number, Phaser.GameObjects.Rectangle> = new Map()

    return () => {
      // ... existing renderSystem code ...

      // Update existing renderables
      const renderables = bitecs.queryComponents(world, [Renderable, Position])
      for (let i = 0; i < renderables.length; i++) {
        const entity = renderables[i]
        const rect = rectangles.get(entity)
        if (rect) {
          rect.setPosition(Position.x[entity], Position.y[entity])
          if (Renderable.type[entity] === 1) { // Job
            rect.setFillStyle(Job.assignedTo[entity] !== 0 ? 0xFFFF00 : 0xFF0000)
          } else if (Renderable.type[entity] === 3) { // Completed building
            rect.setFillStyle(this.buildingColors[Building.type[entity]])
          }
        }
      }

      // ... rest of the renderSystem code ...
    }
  }

  private isInsideGrid(x: number, y: number): boolean {
    return x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight
  }

  public findPath(startX: number, startY: number, endX: number, endY: number): {x: number, y: number}[] | null {
    console.log(`Finding path from (${startX}, ${startY}) to (${endX}, ${endY})`)
    this.pathfindingGrid.updateFromWorld()
    const path = findPath(
      this.pathfindingGrid,
      Math.floor(startX / 15),
      Math.floor(startY / 15),
      Math.floor(endX / 15),
      Math.floor(endY / 15)
    )
    if (path) {
      console.log(`Path found:`, path)
      return path.map(node => ({x: node.x * 15 + 7.5, y: node.y * 15 + 7.5}))
    } else {
      console.log(`No path found`)
      return null
    }
  }
}