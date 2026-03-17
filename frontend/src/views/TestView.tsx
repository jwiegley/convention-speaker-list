export function TestView() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-4xl font-bold text-gray-900 mb-8">Tailwind CSS Test</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Card 1</h2>
          <p className="text-gray-600">This is a test card with Tailwind styling.</p>
          <button className="mt-4 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded">
            Test Button
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Card 2</h2>
          <p className="text-gray-600">Another test card to verify grid layout.</p>
          <button className="mt-4 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded">
            Another Button
          </button>
        </div>
      </div>

      <div className="mt-8 p-4 bg-blue-100 border-l-4 border-blue-500 text-blue-700">
        <p className="font-bold">Info Alert</p>
        <p>If you can see this styled properly, Tailwind CSS is working!</p>
      </div>
    </div>
  );
}
