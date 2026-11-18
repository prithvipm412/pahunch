import type { CircuitComponent, ComponentType, GridPoint } from '../contracts/netlist'

/** Creates a Build component with the editor's default value where applicable. */
export function createBuildComponent(type: ComponentType, id: string, from: GridPoint, to: GridPoint): CircuitComponent {
  const value = type === 'battery' ? 3 : type === 'bulb' || type === 'resistor' ? 10 : type === 'fuse' ? 0.5 : undefined
  return {
    id,
    type,
    from,
    to,
    ...(value === undefined ? {} : { value }),
    ...(type === 'switch' ? { closed: true } : {}),
  }
}
