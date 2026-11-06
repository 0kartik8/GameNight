import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import Home from './pages/Home'
import ImposterGame from './games/imposter/ImposterGame'
import BusinessGame from './games/business/BusinessGame'
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><Routes>
<Route path="/" element={<Home/>}/><Route path="/imposter" element={<ImposterGame/>}/><Route path="/business" element={<BusinessGame/>}/><Route path="*" element={<Home/>}/>
</Routes></BrowserRouter></StrictMode>)