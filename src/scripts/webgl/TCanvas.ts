import * as THREE from 'three'
import { gl } from './core/WebGL'
import { controls } from './utils/OrbitControls'
import { Assets, loadAssets } from './utils/assetLoader'
import GUI from 'lil-gui'

export class TCanvas {
  private walkers = new THREE.Group()
  private silver!: THREE.MeshStandardMaterial
  private gui = new GUI()

  private assets: Assets = {
    envMap: { path: 'images/blocky_photo_studio_1k.hdr' },
  }

  constructor(private container: HTMLElement) {
    loadAssets(this.assets).then(() => {
      this.init()
      this.createMaterial()
      this.createLights()
      this.createProjectionShadowMesh()
      this.createFirstWalker()
      this.createGuideLines(10)
      gl.requestAnimationFrame(this.anime)
    })
  }

  private init() {
    gl.setup(this.container)
    gl.scene.background = new THREE.Color('#fafafa')
    gl.camera.position.set(0, 0, 18)

    controls.primitive.enablePan = false

    const axesHelper = new THREE.AxesHelper(1)
    gl.scene.add(axesHelper)
    axesHelper.visible = false

    gl.setStats(this.container)
    gl.visibleStats = false

    this.gui.close()
    this.gui.add(axesHelper, 'visible').name('axes helper')
    const obj = { stats: false }
    this.gui.add(obj, 'stats').onChange((value: boolean) => {
      gl.visibleStats = value
    })
  }

  private createMaterial() {
    this.silver = new THREE.MeshStandardMaterial({
      color: '#fff',
      envMap: this.assets.envMap.data as THREE.Texture,
      envMapIntensity: 0.5,
      metalness: 1,
      roughness: 0.2,
    })
  }

  private createLights() {
    const ambientLight = new THREE.AmbientLight('#fff', 0.2)
    gl.scene.add(ambientLight)

    const pointLight = new THREE.PointLight('#888', 0.1)
    pointLight.castShadow = true
    pointLight.shadow.mapSize.set(2048, 20248)
    gl.scene.add(pointLight)

    const pointLight2 = new THREE.PointLight('#fff', 0.7)
    gl.scene.add(pointLight2)
  }

  private createProjectionShadowMesh() {
    const geometry = new THREE.SphereGeometry(1, 128, 64)
    const material = new THREE.MeshStandardMaterial({ side: THREE.BackSide })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.receiveShadow = true
    mesh.scale.multiplyScalar(15)
    gl.scene.add(mesh)
  }

  private createGuideLines(grid: number) {
    const spread = Math.trunc(grid / 2)

    const material = new THREE.LineBasicMaterial({
      color: '#000',
      transparent: true,
      opacity: 0.1,
    })

    const points = []
    for (let x = -spread; x <= spread; x++) {
      for (let y = -spread; y <= spread; y++) {
        points.push(x, y, -spread)
        points.push(x, y, spread)
      }
    }
    for (let x = -spread; x <= spread; x++) {
      for (let z = -spread; z <= spread; z++) {
        points.push(x, -spread, z)
        points.push(x, spread, z)
      }
    }
    for (let y = -spread; y <= spread; y++) {
      for (let z = -spread; z <= spread; z++) {
        points.push(-spread, y, z)
        points.push(spread, y, z)
      }
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    const line = new THREE.LineSegments(geometry, material)
    line.visible = false
    gl.scene.add(line)

    this.gui.add(line, 'visible').name('guide line')
  }

  private createFirstWalker() {
    gl.scene.add(this.walkers)

    const lines: { start: THREE.Vector3; end: THREE.Vector3 }[] = [
      { start: new THREE.Vector3(0, 0, 0), end: new THREE.Vector3(1, 0, 0) },
      { start: new THREE.Vector3(0, 0, 0), end: new THREE.Vector3(-1, 0, 0) },
      { start: new THREE.Vector3(0, 0, 0), end: new THREE.Vector3(0, 1, 0) },
    ]

    lines.forEach((line, i) => {
      const walker = new THREE.Group()
      this.walkers.add(walker)
      const walkerFragment = this.createWalker(line.start, line.end, i)
      walker.add(walkerFragment)
      walker.userData = { currentIndex: 0 }
    })
  }

  private createWalker(start: THREE.Vector3, end: THREE.Vector3, _i: number) {
    const len = start.distanceTo(end)
    const pos = end.clone().sub(start).multiplyScalar(0.5).add(start)
    const dir = end.clone().sub(start).normalize()
    const rotAxis = new THREE.Vector3(1, 0, 0).cross(dir)

    const size = 0.08
    const geometry = new THREE.BoxGeometry(len + size, size, size)
    let matrix4 = new THREE.Matrix4()
    matrix4.makeTranslation(pos.x, pos.y, pos.z)
    if (0 < rotAxis.length()) {
      matrix4.multiply(new THREE.Matrix4().makeRotationAxis(rotAxis, Math.PI / 2))
    }
    geometry.applyMatrix4(matrix4)

    const mesh = new THREE.Mesh(geometry, this.silver)
    mesh.castShadow = true
    mesh.receiveShadow = true

    mesh.userData = { start, end, matrix4 }

    return mesh
  }

  private updateWalker(walker: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3) {
    walker.geometry.applyMatrix4((walker.userData.matrix4 as THREE.Matrix4).invert())

    const pos = end.clone().sub(start).multiplyScalar(0.5).add(start)
    const dir = end.clone().sub(start).normalize()
    const rotAxis = new THREE.Vector3(1, 0, 0).cross(dir)

    let matrix4 = new THREE.Matrix4()
    matrix4.makeTranslation(pos.x, pos.y, pos.z)
    if (0 < rotAxis.length()) {
      matrix4.multiply(new THREE.Matrix4().makeRotationAxis(rotAxis, Math.PI / 2))
    }
    walker.geometry.applyMatrix4(matrix4)

    walker.userData = { start, end, matrix4 }
  }

  private calcEnd(walker: THREE.Group, prevEnd: THREE.Vector3) {
    const end = new THREE.Vector3()
    let not = true
    let loop = 0
    while (not) {
      end.copy(prevEnd)

      const r = Math.random() * 6
      if (r < 1) end.add(new THREE.Vector3(1, 0, 0))
      else if (r < 2) end.add(new THREE.Vector3(-1, 0, 0))
      else if (r < 3) end.add(new THREE.Vector3(0, 1, 0))
      else if (r < 4) end.add(new THREE.Vector3(0, -1, 0))
      else if (r < 5) end.add(new THREE.Vector3(0, 0, 1))
      else if (r < 6) end.add(new THREE.Vector3(0, 0, -1))

      // 範囲外からは出ないようにする。絶対にだ
      if (5 < Math.abs(end.x) || 5 < Math.abs(end.y) || 5 < Math.abs(end.z)) continue

      if (10 < loop) {
        break
      } else {
        not = walker.children.some((child) => end.equals(child.userData.end))
        loop++
      }
    }
    return end
  }

  private walk() {
    this.walkers.children.forEach((child, i) => {
      const walker = child as THREE.Group

      if (walker.children.length < 40) {
        // generate
        const prev = walker.children[walker.children.length - 1]
        const end = this.calcEnd(walker, prev.userData.end)
        const walkerFragment = this.createWalker(prev.userData.end, end, i)
        walker.add(walkerFragment)
      } else {
        // update
        // return
        const prevIndex = 0 < walker.userData.currentIndex ? walker.userData.currentIndex - 1 : walker.children.length - 1
        const prev = walker.children[prevIndex]
        const end = this.calcEnd(walker, prev.userData.end)
        const currentWalkerFragment = walker.children[walker.userData.currentIndex] as THREE.Mesh
        this.updateWalker(currentWalkerFragment, prev.userData.end, end)
        walker.userData.currentIndex < walker.children.length - 1 ? walker.userData.currentIndex++ : (walker.userData.currentIndex = 0)
      }
    })
  }

  // ----------------------------------
  // animation
  private t = 0

  private anime = () => {
    if (this.t % 5 === 0) {
      this.walk()
    }
    this.t++

    controls.update()
    gl.render()
  }

  // ----------------------------------
  // dispose
  dispose() {
    gl.dispose()
  }
}
