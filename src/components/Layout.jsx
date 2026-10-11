import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const Layout = () => {
  return (
    <div className="layout-container stark-bg">
      <div className="stark-grid"></div>
      <div className="stark-scanlines"></div>
      <Sidebar />
      <main className="main-content" style={{ position: 'relative', zIndex: 1 }}>
        <Header />
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
