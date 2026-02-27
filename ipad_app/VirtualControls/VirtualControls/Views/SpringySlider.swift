import SwiftUI

struct SpringySlider: View {
    @Binding var value: Double
    let centerValue: Double
    var onChange: (Double) -> Void

    @GestureState private var isDragging = false
    @State private var isAnimating = false

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.black)
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.white)
                    .frame(width: 60, height: 40)
                    .position(x: CGFloat(value) * geometry.size.width, y: geometry.size.height / 2)
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .updating($isDragging) { _, state, _ in
                                state = true
                            }
                            .onChanged { gesture in
                                let newValue = Double(gesture.location.x / geometry.size.width)
                                value = max(0, min(1, newValue))
                                onChange(value)
                            }
                            .onEnded { _ in
                                animateToCenter()
                            }
                    )
            }
        }
    }

    private func animateToCenter() {
        isAnimating = true
        withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
            value = centerValue
        }
        onChange(centerValue)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            isAnimating = false
        }
    }
}
