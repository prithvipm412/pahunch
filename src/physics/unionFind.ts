export class UnionFind {
  private parent = new Map<string, string>()
  private rank = new Map<string, number>()

  private ensure(key: string): void {
    if (!this.parent.has(key)) {
      this.parent.set(key, key)
      this.rank.set(key, 0)
    }
  }

  find(key: string): string {
    this.ensure(key)
    let root = key
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root) as string
    }
    let cur = key
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur) as string
      this.parent.set(cur, root)
      cur = next
    }
    return root
  }

  connected(a: string, b: string): boolean {
    return this.find(a) === this.find(b)
  }

  // Returns true if this union actually merged two distinct sets (tree edge),
  // false if a and b were already connected (redundant/cycle edge).
  union(a: string, b: string): boolean {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA === rootB) return false

    const rankA = this.rank.get(rootA) as number
    const rankB = this.rank.get(rootB) as number
    if (rankA < rankB) {
      this.parent.set(rootA, rootB)
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA)
    } else {
      this.parent.set(rootB, rootA)
      this.rank.set(rootA, rankA + 1)
    }
    return true
  }
}
