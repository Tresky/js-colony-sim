import { defineComponent, Types } from 'bitecs'

export const Position = defineComponent({
  x: Types.f32,
  y: Types.f32,
})

export const Citizen = defineComponent({
  hunger: Types.f32,
  energy: Types.f32,
})

export const Job = defineComponent({
  type: Types.ui8,
  priority: Types.ui8,
  progress: Types.f32,
  assignedTo: Types.eid,
})

export const JobQueue = defineComponent({
  head: Types.eid,
  tail: Types.eid,
  size: Types.ui16,
})

// Add a new component to store the next job in the queue
export const NextJob = defineComponent({
  nextJobId: Types.eid,
})

// Add a new component for rendering
export const Renderable = defineComponent({
  type: Types.ui8, // 0 for citizen, 1 for job
  rectId: Types.ui32, // Store the ID of the Phaser Rectangle object
})

// Add a new component for the building
export const Building = defineComponent({
  type: Types.ui8, // 0 for house, 1 for mill, 2 for warehouse
})