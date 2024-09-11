import { defineQuery, enterQuery, exitQuery, removeEntity, addComponent, addEntity } from 'bitecs'
import { Position, Citizen, Job, JobQueue, NextJob, Renderable, Building } from './components'
import { world } from './world'
import Phaser from 'phaser'
import { Game } from '../scenes/Game'

const citizenQuery = defineQuery([Citizen, Position])
const jobQuery = defineQuery([Job])
const jobQueueQuery = defineQuery([JobQueue])
const nextJobQuery = defineQuery([NextJob])
const buildingQuery = defineQuery([Building])

const renderableQuery = defineQuery([Renderable, Position])
const renderableEnterQuery = enterQuery(renderableQuery)
const renderableExitQuery = exitQuery(renderableQuery)

export const createMovementSystem = (scene: Game) => {
  return (dt: number) => {
    const entities = citizenQuery(world)
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i]
      const assignedJob = jobQuery(world).find(job => Job.assignedTo[job] === entity)
      
      if (assignedJob) {
        console.log(`Citizen ${entity} moving to job ${assignedJob} at (${Position.x[assignedJob]}, ${Position.y[assignedJob]})`)
        const path = scene.findPath(
          Position.x[entity],
          Position.y[entity],
          Position.x[assignedJob],
          Position.y[assignedJob]
        )

        if (path && path.length > 1) {
          console.log(`Path found for citizen ${entity}:`, path)
          const nextPoint = path[1]
          const dx = nextPoint.x - Position.x[entity]
          const dy = nextPoint.y - Position.y[entity]
          const distance = Math.sqrt(dx * dx + dy * dy)
          
          if (distance > 1) {
            const speed = 200 // pixels per second
            
            const vx = (dx / distance) * speed * dt
            const vy = (dy / distance) * speed * dt
            
            // Prevent overshooting
            if (Math.abs(vx) > Math.abs(dx)) {
              Position.x[entity] = nextPoint.x
            } else {
              Position.x[entity] += vx
            }
            
            if (Math.abs(vy) > Math.abs(dy)) {
              Position.y[entity] = nextPoint.y
            } else {
              Position.y[entity] += vy
            }
            console.log(`Citizen ${entity} moved to (${Position.x[entity]}, ${Position.y[entity]})`)
          } else {
            Position.x[entity] = nextPoint.x
            Position.y[entity] = nextPoint.y
            console.log(`Citizen ${entity} reached next point (${nextPoint.x}, ${nextPoint.y})`)
          }
        } else if (path && path.length === 1) {
          console.log(`Citizen ${entity} reached job site`)
          // Citizen has reached the job site, start working
          Job.progress[assignedJob] += dt * 0.9 // Increase job progress
          if (Job.progress[assignedJob] >= 1) {
            // Job is completed
            if (Job.type[assignedJob] === 255) {
              // Eating job completed
              Citizen.hunger[entity] = 0 // Reset hunger
              removeEntity(world, assignedJob)
              console.log(`Citizen ${entity} completed eating job`)
            }
          }
        } else {
          console.log(`No path found for citizen ${entity} to job ${assignedJob}`)
          console.log(`Citizen position: (${Position.x[entity]}, ${Position.y[entity]})`)
          console.log(`Job position: (${Position.x[assignedJob]}, ${Position.y[assignedJob]})`)
        }
      } else {
        console.log(`Citizen ${entity} has no assigned job`)
      }
    }
    return world
  }
}

export const hungerSystem = (dt: number) => {
  const entities = citizenQuery(world)
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i]
    Citizen.hunger[entity] += dt * 0.1 // Increase hunger over time
  }
  return world
}

export const jobSchedulingSystem = () => {
  const citizens = citizenQuery(world)
  const jobs = jobQuery(world)
  const foodBuildings = buildingQuery(world)

  for (let i = 0; i < citizens.length; i++) {
    const citizen = citizens[i]
    if (Citizen.energy[citizen] > 0) {
      const currentJob = jobs.find(job => Job.assignedTo[job] === citizen)
      
      // Check if citizen is too hungry
      if (Citizen.hunger[citizen] > 0.5) {
        // If already assigned to an eating job, continue
        if (currentJob && Job.type[currentJob] === 255) continue

        // Create an eating job
        const foodBuilding = foodBuildings[0] // Assume only one food building for now
        const eatingJob = addEntity(world)
        addComponent(world, Job, eatingJob)
        addComponent(world, Position, eatingJob)
        Job.type[eatingJob] = 255 // Special type for eating job
        Job.priority[eatingJob] = 255 // Highest priority
        Job.progress[eatingJob] = 0
        Job.assignedTo[eatingJob] = citizen
        Position.x[eatingJob] = Position.x[foodBuilding]
        Position.y[eatingJob] = Position.y[foodBuilding]

        // Unassign current job if exists
        if (currentJob) {
          Job.assignedTo[currentJob] = 0
        }

        continue // Skip regular job assignment
      }

      let bestJob = null
      let bestScore = Infinity

      for (let j = 0; j < jobs.length; j++) {
        const job = jobs[j]
        if (Job.assignedTo[job] === 0 || Job.assignedTo[job] === citizen) {
          const dx = Position.x[job] - Position.x[citizen]
          const dy = Position.y[job] - Position.y[citizen]
          const distanceToCitizen = Math.sqrt(dx * dx + dy * dy)

          let score = distanceToCitizen

          // If the citizen is already assigned to a job, check if this new job is on the way
          if (currentJob && currentJob !== job) {
            const dxCurrent = Position.x[currentJob] - Position.x[citizen]
            const dyCurrent = Position.y[currentJob] - Position.y[citizen]
            const distanceToCurrent = Math.sqrt(dxCurrent * dxCurrent + dyCurrent * dyCurrent)

            const dxJobToCurrent = Position.x[currentJob] - Position.x[job]
            const dyJobToCurrent = Position.y[currentJob] - Position.y[job]
            const distanceJobToCurrent = Math.sqrt(dxJobToCurrent * dxJobToCurrent + dyJobToCurrent * dyJobToCurrent)

            // If the new job is closer and doesn't take us too far off course
            if (distanceToCitizen < distanceToCurrent && distanceJobToCurrent < distanceToCurrent) {
              score = distanceToCitizen + distanceJobToCurrent * 0.5 // Weighted score
            } else {
              score = Infinity // Not a better option
            }
          }

          if (score < bestScore) {
            bestJob = job
            bestScore = score
          }
        }
      }

      if (bestJob && bestJob !== currentJob) {
        if (currentJob) {
          Job.assignedTo[currentJob] = 0 // Unassign current job
        }
        Job.assignedTo[bestJob] = citizen
      }
    }
  }

  return world
}

export const jobCompletionSystem = () => {
  const jobQueues = jobQueueQuery(world)
  const nextJobs = nextJobQuery(world)
  const jobs = jobQuery(world)
  const completedBuildingJobs: number[] = []
  const processedJobs = new Set()
  
  for (let i = 0; i < jobs.length; i++) {
    const currentJob = jobs[i]
    if (currentJob && Job.progress[currentJob] >= 1 && !processedJobs.has(currentJob)) {
      processedJobs.add(currentJob)
      
      // Job completed
      if (Job.type[currentJob] === 3) { // Building job
        completedBuildingJobs.push(currentJob)
      }
    }
  }

  return completedBuildingJobs
}

export const createRenderSystem = (scene: Phaser.Scene) => {
  const rectangles: Map<number, Phaser.GameObjects.Rectangle> = new Map()

  return () => {
    // Handle new renderables
    const newRenderables = renderableEnterQuery(world)
    for (let i = 0; i < newRenderables.length; i++) {
      const entity = newRenderables[i]
      const type = Renderable.type[entity]
      const x = Position.x[entity]
      const y = Position.y[entity]
      const size = 15 // Change size to 15px for all entities
      let color = 0xFFFFFF // Default color

      if (type === 0) { // Citizen
        color = 0xFFFFFF
      } else if (type === 1) { // Job
        color = 0xFF0000
      } else if (type === 2) { // Food building
        color = 0x0000FF
      } else if (type === 3) { // Completed building
        color = scene.buildingColors[Building.type[entity]]
      }

      const rect = scene.add.rectangle(x, y, size, size, color)
        .setOrigin(0)
        .setStrokeStyle(1, 0x000000)
      rectangles.set(entity, rect)
    }

    // Update existing renderables
    const renderables = renderableQuery(world)
    for (let i = 0; i < renderables.length; i++) {
      const entity = renderables[i]
      const rect = rectangles.get(entity)
      if (rect) {
        const x = Position.x[entity]
        const y = Position.y[entity]
        rect.setPosition(x, y)
        if (Renderable.type[entity] === 1) { // Job
          rect.setFillStyle(Job.assignedTo[entity] !== 0 ? 0xFFFF00 : 0xFF0000)
        } else if (Renderable.type[entity] === 3) { // Completed building
          rect.setFillStyle(scene.buildingColors[Building.type[entity]])
        }
      }
    }

    // Remove deleted renderables
    const removedRenderables = renderableExitQuery(world)
    for (let i = 0; i < removedRenderables.length; i++) {
      const entity = removedRenderables[i]
      const rect = rectangles.get(entity)
      if (rect) {
        rect.destroy()
        rectangles.delete(entity)
      }
    }

    return world
  }
}

export const createPathRenderSystem = (scene: Phaser.Scene) => {
  const graphics = scene.add.graphics();

  return () => {
    const citizens = citizenQuery(world)
    const jobs = jobQuery(world)

    // Clear previous drawings
    graphics.clear();

    // Set line style
    graphics.lineStyle(1, 0xAAAAAA, 0.5);

    // Draw new paths
    for (let i = 0; i < citizens.length; i++) {
      const citizen = citizens[i]
      const assignedJob = jobs.find(job => Job.assignedTo[job] === citizen)

      if (assignedJob) {
        const startX = Position.x[citizen]
        const startY = Position.y[citizen]
        const endX = Position.x[assignedJob]
        const endY = Position.y[assignedJob]

        graphics.beginPath();
        graphics.moveTo(startX, startY);
        graphics.lineTo(endX, endY);
        graphics.strokePath();
      }
    }

    return world
  }
}

export const createStatusDisplaySystem = (scene: Phaser.Scene) => {
  const statusTexts: Phaser.GameObjects.Text[] = [];

  return () => {
    const citizens = citizenQuery(world);

    // Remove existing status texts
    statusTexts.forEach(text => text.destroy());
    statusTexts.length = 0;

    // Create new status texts
    citizens.forEach((citizen, index) => {
      const assignedJob = jobQuery(world).find(job => Job.assignedTo[job] === citizen);
      let statusText = "Idle";

      if (assignedJob) {
        const dx = Position.x[assignedJob] - Position.x[citizen];
        const dy = Position.y[assignedJob] - Position.y[citizen];
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 1) {
          const totalDistance = Math.sqrt(
            Math.pow(Position.x[assignedJob] - Position.x[citizen], 2) +
            Math.pow(Position.y[assignedJob] - Position.y[citizen], 2)
          );
          const progress = ((totalDistance - distance) / totalDistance) * 100;
          statusText = `Walking: ${progress.toFixed(1)}%`;
        } else {
          statusText = `Working: ${(Job.progress[assignedJob] * 100).toFixed(1)}%`;
        }
      }

      // Add hunger value to the status text
      const hungerValue = Citizen.hunger[citizen].toFixed(1);
      
      const text = scene.add.text(10, 10 + index * 20, 
        `Citizen ${index + 1}: Hunger: ${hungerValue} | ${statusText}`, {
        fontSize: '16px',
        color: '#ffffff'
      });
      statusTexts.push(text);
    });

    return world;
  };
};

export const createBuildingModeSystem = (scene: Phaser.Scene) => {
  return () => {
    // This system doesn't need to do anything for now,
    // but we can add logic here later if needed
    return world
  }
}