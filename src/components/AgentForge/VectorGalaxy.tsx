import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

interface Memory {
  id: string
  content: string
  embedding: number[]
  strength: number
  tags: string[]
  created_at: string
}

interface VectorGalaxyProps {
  memories: Memory[]
  onMemoryClick?: (memory: Memory) => void
  selectedMemoryId?: string
}

export default function VectorGalaxy({ memories, onMemoryClick, selectedMemoryId }: VectorGalaxyProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const pointsRef = useRef<THREE.Points[]>([])
  const [hoveredMemory, setHoveredMemory] = useState<Memory | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a0f)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    )
    camera.position.z = 50
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controlsRef.current = controls

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambientLight)

    // Point light
    const pointLight = new THREE.PointLight(0x00ffff, 1, 100)
    pointLight.position.set(0, 0, 50)
    scene.add(pointLight)

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      containerRef.current?.removeChild(renderer.domElement)
    }
  }, [])

  // Render memory points
  useEffect(() => {
    if (!sceneRef.current || memories.length === 0) return

    // Clear existing points
    pointsRef.current.forEach(point => sceneRef.current?.remove(point))
    pointsRef.current = []

    // Use PCA to reduce embeddings to 3D (simplified - just take first 3 dimensions)
    memories.forEach(memory => {
      const geometry = new THREE.SphereGeometry(0.5, 16, 16)
      
      // Color based on strength (weak = blue, strong = cyan)
      const color = new THREE.Color().setHSL(0.55, 1, 0.3 + memory.strength * 0.4)
      const material = new THREE.MeshPhongMaterial({
        color,
        emissive: color,
        emissiveIntensity: memory.strength,
        transparent: true,
        opacity: 0.6 + memory.strength * 0.4
      })

      const mesh = new THREE.Mesh(geometry, material)

      // Position based on embedding (simplified 3D projection)
      const scale = 30
      mesh.position.x = (memory.embedding[0] || 0) * scale
      mesh.position.y = (memory.embedding[1] || 0) * scale
      mesh.position.z = (memory.embedding[2] || 0) * scale

      // Store memory data
      mesh.userData = { memory }

      sceneRef.current?.add(mesh)
      pointsRef.current.push(mesh as any)

      // Highlight selected memory
      if (memory.id === selectedMemoryId) {
        const selectedMaterial = material.clone()
        selectedMaterial.emissiveIntensity = 1.5
        selectedMaterial.opacity = 1
        mesh.material = selectedMaterial
      }
    })
  }, [memories, selectedMemoryId])

  // Handle click interaction
  useEffect(() => {
    if (!rendererRef.current || !cameraRef.current || !sceneRef.current) return

    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current || !cameraRef.current || !sceneRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, cameraRef.current)
      const intersects = raycaster.intersectObjects(sceneRef.current.children)

      if (intersects.length > 0) {
        const object = intersects[0].object
        if (object.userData.memory) {
          onMemoryClick?.(object.userData.memory)
        }
      }
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!containerRef.current || !cameraRef.current || !sceneRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, cameraRef.current)
      const intersects = raycaster.intersectObjects(sceneRef.current.children)

      if (intersects.length > 0 && intersects[0].object.userData.memory) {
        setHoveredMemory(intersects[0].object.userData.memory)
      } else {
        setHoveredMemory(null)
      }
    }

    const canvas = rendererRef.current.domElement
    canvas.addEventListener('click', handleClick)
    canvas.addEventListener('mousemove', handleMouseMove)

    return () => {
      canvas.removeEventListener('click', handleClick)
      canvas.removeEventListener('mousemove', handleMouseMove)
    }
  }, [onMemoryClick])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      
      {/* Memory tooltip */}
      {hoveredMemory && (
        <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-4 max-w-sm">
          <p className="text-cyan-400 text-sm font-mono mb-2">
            Strength: {(hoveredMemory.strength * 100).toFixed(0)}%
          </p>
          <p className="text-gray-300 text-sm line-clamp-3">{hoveredMemory.content}</p>
          {hoveredMemory.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {hoveredMemory.tags.map(tag => (
                <span key={tag} className="text-xs text-cyan-400 bg-cyan-900/30 px-2 py-1 rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-black/80 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-4">
        <h3 className="text-cyan-400 text-sm font-mono mb-2">Memory Strength</h3>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <div className="w-3 h-3 rounded-full bg-blue-500/60" />
          <span>Weak</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
          <div className="w-3 h-3 rounded-full bg-cyan-400" />
          <span>Strong</span>
        </div>
      </div>
    </div>
  )
}
